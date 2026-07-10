// Bot de chat para los lives de TikTok de danaosth.
//
// Qué hace:
//   1. Se conecta al live de TikTok y lee los comentarios del chat.
//   2. Le pasa cada pregunta a Claude junto con la información de la tienda (negocio.md).
//   3. Muestra las respuestas en un panel web (http://localhost:3000) que puede
//      leerlas en voz alta durante la transmisión.

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const Anthropic = require('@anthropic-ai/sdk');

// ── Configuración ────────────────────────────────────────────────────────────

const USUARIO_TIKTOK = process.env.TIKTOK_USERNAME || 'danaosth';
const PUERTO = Number(process.env.PORT) || 3000;
const MODELO = process.env.CLAUDE_MODEL || 'claude-opus-4-8';
const SEGUNDOS_ENTRE_REINTENTOS = 30;
const ENFRIAMIENTO_POR_USUARIO_MS = 20_000; // no responder al mismo usuario 2 veces en 20 s
const MAX_COLA = 8; // si llegan demasiadas preguntas juntas, se descartan las más viejas

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('');
  console.error('❌ Falta la clave de la API de Claude.');
  console.error('   1. Crea una cuenta en https://console.anthropic.com y genera una API key.');
  console.error('   2. Copia el archivo .env.example como .env y pega ahí tu clave.');
  console.error('');
  process.exit(1);
}

const infoNegocio = fs.readFileSync(path.join(__dirname, 'negocio.md'), 'utf8');

const PROMPT_SISTEMA = `Eres el asistente del chat en vivo de la tienda "danaosth" en TikTok.
La dueña está transmitiendo en vivo y tú respondes las preguntas de los espectadores.

Reglas:
- Responde SOLO preguntas relacionadas con la tienda: productos, precios, tallas, envíos, pagos, cómo comprar, horarios, etc.
- Usa únicamente la información de la tienda que aparece abajo. Si no sabes algo, di amablemente que la vendedora lo responderá en el live; NUNCA inventes precios ni datos.
- Respuestas cortas (1 a 3 frases), en español, con el tono indicado en la información de la tienda.
- Si el comentario NO es una pregunta para la tienda (saludos sueltos, emojis, spam, temas ajenos), responde exactamente con la palabra: SKIP
- No des consejos médicos, legales ni de otros temas. Para eso responde SKIP.

=== INFORMACIÓN DE LA TIENDA ===
${infoNegocio}
=== FIN DE LA INFORMACIÓN ===`;

const anthropic = new Anthropic();

// ── Panel web (para que la vendedora vea/escuche las respuestas) ─────────────

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const servidor = http.createServer(app);
const wss = new WebSocketServer({ server: servidor });

function transmitirAlPanel(mensaje) {
  const texto = JSON.stringify(mensaje);
  for (const cliente of wss.clients) {
    if (cliente.readyState === 1) cliente.send(texto);
  }
}

let ultimoEstado = { tipo: 'estado', conectado: false, usuario: USUARIO_TIKTOK };
function actualizarEstado(conectado, detalle = '') {
  ultimoEstado = { tipo: 'estado', conectado, usuario: USUARIO_TIKTOK, detalle };
  transmitirAlPanel(ultimoEstado);
}

wss.on('connection', (cliente) => {
  cliente.send(JSON.stringify(ultimoEstado));
});

servidor.listen(PUERTO, () => {
  console.log(`✅ Panel listo: abre http://localhost:${PUERTO} en el navegador`);
});

// ── Cola de preguntas → Claude ───────────────────────────────────────────────

const cola = [];
const ultimaRespuestaPorUsuario = new Map();
let procesando = false;

function encolarComentario(usuario, comentario) {
  const texto = (comentario || '').trim();
  if (texto.length < 4) return; // emojis o mensajes demasiado cortos

  const ahora = Date.now();
  const ultima = ultimaRespuestaPorUsuario.get(usuario) || 0;
  if (ahora - ultima < ENFRIAMIENTO_POR_USUARIO_MS) return;

  cola.push({ usuario, texto });
  while (cola.length > MAX_COLA) cola.shift();
  procesarCola();
}

async function procesarCola() {
  if (procesando) return;
  procesando = true;
  try {
    while (cola.length > 0) {
      const { usuario, texto } = cola.shift();
      await responderComentario(usuario, texto);
    }
  } finally {
    procesando = false;
  }
}

async function responderComentario(usuario, texto) {
  try {
    const respuesta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 512,
      output_config: { effort: 'low' },
      system: [
        {
          type: 'text',
          text: PROMPT_SISTEMA,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: `Comentario de "${usuario}" en el live: ${texto}` },
      ],
    });

    if (respuesta.stop_reason === 'refusal') return;

    const bloqueTexto = respuesta.content.find((b) => b.type === 'text');
    const contestacion = bloqueTexto ? bloqueTexto.text.trim() : '';

    if (!contestacion || contestacion === 'SKIP') return;

    ultimaRespuestaPorUsuario.set(usuario, Date.now());
    console.log(`💬 ${usuario}: ${texto}`);
    console.log(`🤖 ${contestacion}`);

    transmitirAlPanel({
      tipo: 'respuesta',
      usuario,
      pregunta: texto,
      respuesta: contestacion,
      hora: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      console.error('⚠️ Límite de la API alcanzado, esperando 30 s...');
      await new Promise((r) => setTimeout(r, 30_000));
    } else if (error instanceof Anthropic.AuthenticationError) {
      console.error('❌ La API key de Claude no es válida. Revisa el archivo .env');
      process.exit(1);
    } else {
      console.error('⚠️ Error al generar respuesta:', error.message || error);
    }
  }
}

// ── Conexión al live de TikTok ───────────────────────────────────────────────

const conexionTikTok = new WebcastPushConnection(USUARIO_TIKTOK, {
  processInitialData: false, // ignorar comentarios viejos de antes de conectar
});

conexionTikTok.on('chat', (dato) => {
  const usuario = dato.nickname || dato.uniqueId || 'espectador';
  encolarComentario(usuario, dato.comment);
});

conexionTikTok.on('streamEnd', () => {
  console.log('📴 El live terminó. Esperando a que empiece otro...');
  actualizarEstado(false, 'El live terminó');
  programarReconexion();
});

conexionTikTok.on('disconnected', () => {
  console.log('🔌 Conexión perdida con TikTok. Reintentando...');
  actualizarEstado(false, 'Conexión perdida, reintentando');
  programarReconexion();
});

let reintentoProgramado = null;
function programarReconexion() {
  if (reintentoProgramado) return;
  reintentoProgramado = setTimeout(() => {
    reintentoProgramado = null;
    conectarAlLive();
  }, SEGUNDOS_ENTRE_REINTENTOS * 1000);
}

async function conectarAlLive() {
  try {
    const estado = await conexionTikTok.connect();
    console.log(`🎥 Conectado al live de @${USUARIO_TIKTOK} (roomId ${estado.roomId})`);
    actualizarEstado(true);
  } catch (error) {
    const msg = String(error && error.message ? error.message : error);
    if (msg.includes("isn't online") || msg.includes('offline') || msg.includes('LIVE has ended')) {
      console.log(`⏳ @${USUARIO_TIKTOK} no está en vivo todavía. Reintentando en ${SEGUNDOS_ENTRE_REINTENTOS} s...`);
      actualizarEstado(false, 'Esperando a que empiece el live');
    } else {
      console.error('⚠️ No se pudo conectar a TikTok:', msg);
      actualizarEstado(false, 'Error de conexión, reintentando');
    }
    programarReconexion();
  }
}

console.log(`🚀 Bot de danaosth iniciando (modelo: ${MODELO})`);
conectarAlLive();
