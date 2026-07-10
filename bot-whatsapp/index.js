// Bot de WhatsApp para la tienda danaosth.
//
// Qué hace:
//   1. Se vincula al WhatsApp de la tienda escaneando un código QR (como WhatsApp Web).
//   2. Cuando un cliente escribe, Claude responde con la información de negocio.md.
//   3. Recuerda la conversación con cada cliente (puede tomar pedidos paso a paso).
//   4. Si la dueña responde manualmente un chat desde su celular, el bot se queda
//      callado en ese chat durante PAUSA_MINUTOS para no interrumpirla.

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Anthropic = require('@anthropic-ai/sdk');

// ── Configuración ────────────────────────────────────────────────────────────

const MODELO = process.env.CLAUDE_MODEL || 'claude-opus-4-8';
const PAUSA_MINUTOS = Number(process.env.PAUSA_MINUTOS) || 30;
const MAX_TURNOS_MEMORIA = 20; // mensajes recordados por conversación
const HORAS_PARA_OLVIDAR = 6; // si el cliente no escribe en 6 h, la charla empieza de cero

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('');
  console.error('❌ Falta la clave de la API de Claude.');
  console.error('   1. Crea una cuenta en https://console.anthropic.com y genera una API key.');
  console.error('   2. Copia el archivo .env.example como .env y pega ahí tu clave.');
  console.error('');
  process.exit(1);
}

const infoNegocio = fs.readFileSync(path.join(__dirname, 'negocio.md'), 'utf8');

const PROMPT_SISTEMA = `Eres la asistente virtual de WhatsApp de la tienda "danaosth".
La dueña suele estar transmitiendo en vivo en TikTok (@danaosth) y por eso tú atiendes el WhatsApp.

Reglas:
- Atiende con calidez: saluda, responde preguntas sobre productos, precios, tallas, envíos y pagos, y toma pedidos siguiendo los pasos indicados en la información de la tienda.
- Usa ÚNICAMENTE la información de la tienda que aparece abajo. Si algo no está ahí, dilo con honestidad y ofrece que la dueña lo confirme en cuanto se desocupe. NUNCA inventes precios, stock ni promociones.
- Mensajes cortos estilo WhatsApp (1 a 4 frases), en español, con el tono indicado.
- Si el cliente pide hablar con una persona, tiene un reclamo, o pide algo delicado (devoluciones de dinero, problemas con un pedido ya pagado), responde que la dueña le contestará personalmente en cuanto termine el live, y no intentes resolverlo tú.
- No confirmes pagos ni des por cerrada una venta: al tomar un pedido, junta los datos y aclara que la dueña lo confirmará.
- Si te escriben en otro idioma, responde en ese idioma.
- No respondas temas ajenos a la tienda (política, medicina, tareas, etc.); redirige amablemente a temas de la tienda.

=== INFORMACIÓN DE LA TIENDA ===
${infoNegocio}
=== FIN DE LA INFORMACIÓN ===`;

const anthropic = new Anthropic();

// ── Memoria de conversaciones y pausas ───────────────────────────────────────

const conversaciones = new Map(); // chatId -> { mensajes: [...], ultimaVez: timestamp }
const chatsPausados = new Map(); // chatId -> timestamp hasta cuándo está pausado
const trabajando = new Map(); // chatId -> Promise (para responder en orden)

function obtenerConversacion(chatId) {
  const ahora = Date.now();
  let conv = conversaciones.get(chatId);
  if (!conv || ahora - conv.ultimaVez > HORAS_PARA_OLVIDAR * 3_600_000) {
    conv = { mensajes: [], ultimaVez: ahora };
    conversaciones.set(chatId, conv);
  }
  conv.ultimaVez = ahora;
  return conv;
}

function estaPausado(chatId) {
  const hasta = chatsPausados.get(chatId);
  if (!hasta) return false;
  if (Date.now() > hasta) {
    chatsPausados.delete(chatId);
    return false;
  }
  return true;
}

function pausarChat(chatId) {
  chatsPausados.set(chatId, Date.now() + PAUSA_MINUTOS * 60_000);
}

// ── Claude ───────────────────────────────────────────────────────────────────

async function generarRespuesta(chatId, nombreCliente, textoCliente) {
  const conv = obtenerConversacion(chatId);
  conv.mensajes.push({ role: 'user', content: textoCliente });
  while (conv.mensajes.length > MAX_TURNOS_MEMORIA) conv.mensajes.shift();
  if (conv.mensajes[0] && conv.mensajes[0].role !== 'user') conv.mensajes.shift();

  const respuesta = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 1024,
    output_config: { effort: 'low' },
    system: [
      {
        type: 'text',
        text: PROMPT_SISTEMA,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `(El cliente se llama "${nombreCliente}". Esta nota es solo contexto, no la menciones salvo que sea natural.)`,
      },
      { role: 'assistant', content: 'Entendido.' },
      ...conv.mensajes,
    ],
  });

  if (respuesta.stop_reason === 'refusal') {
    conv.mensajes.pop();
    return null;
  }

  const bloqueTexto = respuesta.content.find((b) => b.type === 'text');
  const texto = bloqueTexto ? bloqueTexto.text.trim() : '';
  if (!texto) {
    conv.mensajes.pop();
    return null;
  }

  conv.mensajes.push({ role: 'assistant', content: texto });
  return texto;
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────

const cliente = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.sesion') }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    // Opcional: ruta a un Chrome ya instalado (normalmente no hace falta)
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  },
});

cliente.on('qr', (qr) => {
  console.log('');
  console.log('📱 Escanea este código QR con el WhatsApp de la tienda:');
  console.log('   WhatsApp → Configuración → Dispositivos vinculados → Vincular dispositivo');
  console.log('');
  qrcode.generate(qr, { small: true });
});

cliente.on('ready', () => {
  console.log('✅ WhatsApp conectado. El bot ya está atendiendo a los clientes.');
  console.log(`   (Si respondes un chat tú misma, el bot se calla ahí por ${PAUSA_MINUTOS} min)`);
});

cliente.on('disconnected', (motivo) => {
  console.log('🔌 WhatsApp se desconectó:', motivo);
  console.log('   Vuelve a ejecutar "npm start" para reconectar.');
});

cliente.on('auth_failure', () => {
  console.error('❌ WhatsApp rechazó la sesión guardada.');
  console.error('   Borra la carpeta ".sesion" y ejecuta "npm start" para escanear el QR de nuevo.');
});

// Si la dueña responde manualmente desde su celular, pausar el bot en ese chat
cliente.on('message_create', (msg) => {
  if (msg.fromMe && !msg.to.endsWith('@g.us') && msg.to !== 'status@broadcast') {
    pausarChat(msg.to);
  }
});

cliente.on('message', (msg) => {
  const chatId = msg.from;

  // Ignorar grupos, estados y mensajes sin texto (fotos/audios los ve la dueña luego)
  if (chatId.endsWith('@g.us') || chatId === 'status@broadcast') return;
  if (!msg.body || !msg.body.trim()) return;
  if (estaPausado(chatId)) return;

  // Procesar los mensajes de cada chat en orden, uno por uno
  const anterior = trabajando.get(chatId) || Promise.resolve();
  const tarea = anterior.then(() => atenderMensaje(msg, chatId)).catch(() => {});
  trabajando.set(chatId, tarea);
});

async function atenderMensaje(msg, chatId) {
  try {
    if (estaPausado(chatId)) return; // pudo pausarse mientras esperaba en la cola

    const contacto = await msg.getContact();
    const nombre = contacto.pushname || contacto.name || 'cliente';

    const chat = await msg.getChat();
    await chat.sendStateTyping(); // que se vea "escribiendo..."

    const texto = await generarRespuesta(chatId, nombre, msg.body.trim());

    await chat.clearState();
    if (!texto) return;
    if (estaPausado(chatId)) return; // la dueña respondió mientras pensábamos

    await cliente.sendMessage(chatId, texto);
    console.log(`💬 ${nombre}: ${msg.body.trim()}`);
    console.log(`🤖 ${texto}`);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      console.error('⚠️ Límite de la API alcanzado, esperando 30 s...');
      await new Promise((r) => setTimeout(r, 30_000));
    } else if (error instanceof Anthropic.AuthenticationError) {
      console.error('❌ La API key de Claude no es válida. Revisa el archivo .env');
      process.exit(1);
    } else {
      console.error('⚠️ Error atendiendo un mensaje:', error.message || error);
    }
  }
}

console.log(`🚀 Bot de WhatsApp de danaosth iniciando (modelo: ${MODELO})`);
console.log('   Conectando con WhatsApp, espera unos segundos...');

cliente.initialize().catch((error) => {
  const msg = String(error && error.message ? error.message : error);
  console.error('');
  console.error('❌ No se pudo conectar con WhatsApp Web.');
  if (msg.includes('ERR_') || msg.includes('net::')) {
    console.error('   Parece un problema de internet: revisa la conexión y vuelve a ejecutar "npm start".');
  } else if (msg.includes('Could not find') || msg.includes('executablePath') || msg.includes('spawn')) {
    console.error('   No se encontró el navegador interno. Ejecuta "npm install" de nuevo.');
  } else {
    console.error('   Detalle:', msg);
  }
  console.error('');
  process.exit(1);
});
