# 💬 Bot de WhatsApp — danaosth

Bot que **responde automáticamente el WhatsApp de la tienda** mientras la dueña
está transmitiendo en vivo en TikTok. Usa la inteligencia artificial de Claude
con la información real de la tienda (precios, envíos, pagos) y puede **tomar
pedidos** paso a paso.

## Cómo funciona

- Se vincula al WhatsApp de la tienda **escaneando un código QR**, igual que WhatsApp Web.
- Cuando un cliente escribe, el bot responde en segundos con el tono de la tienda.
- **Recuerda la conversación** con cada cliente, así puede tomar un pedido completo
  (producto, nombre, dirección, forma de pago) y avisar que la dueña lo confirmará.
- Si la dueña **responde ella misma un chat desde su celular, el bot se calla en ese
  chat por 30 minutos** — así nunca se pisan.
- No responde grupos ni estados, solo chats directos de clientes.
- Nunca inventa precios: si algo no está en `negocio.md`, dice que la dueña lo confirmará.

## Requisitos

- Una computadora **encendida y con internet mientras el bot atiende**
  (Windows, Mac o Linux) con [Node.js](https://nodejs.org) instalado (versión 18+).
- Una API key de Claude: se crea en [console.anthropic.com](https://console.anthropic.com).
  Cada respuesta cuesta centavos.
- El celular con el WhatsApp de la tienda (solo para escanear el QR la primera vez).

## Instalación (solo la primera vez)

```bash
cd bot-whatsapp
npm install
```

(La instalación tarda unos minutos porque descarga un navegador interno que usa para conectarse a WhatsApp.)

Luego:

1. Copia el archivo `.env.example` con el nombre `.env`.
2. Abre `.env` y pega tu API key de Claude donde dice `ANTHROPIC_API_KEY=`.
3. Abre `negocio.md` y **completa la información real de la tienda**:
   productos, precios, envíos, formas de pago, cómo tomar pedidos.
   ⭐ Este es el paso más importante: el bot solo sabe lo que está escrito ahí.

## Cómo usarlo

1. Ejecuta dentro de la carpeta `bot-whatsapp`:

   ```bash
   npm start
   ```

2. La primera vez aparecerá un **código QR en la pantalla**. Escanéalo con el
   celular de la tienda: *WhatsApp → Configuración → Dispositivos vinculados →
   Vincular dispositivo* (igual que WhatsApp Web).
3. Cuando diga `✅ WhatsApp conectado`, ¡listo! El bot atiende solo.
   Las siguientes veces ya no pide QR: se conecta directo.

Deja el programa corriendo mientras ella transmite (o todo el día si quieren
atención 24/7). Para apagarlo: `Ctrl + C` en la ventana del programa.

## Detalles buenos que trae

| Situación | Qué hace el bot |
|---|---|
| Cliente pregunta precio/envío/pago | Responde al instante con la info de `negocio.md` |
| Cliente quiere comprar | Le pide producto, nombre, dirección y forma de pago, y avisa que la dueña confirmará |
| Cliente pide hablar con una persona o reclama | Le dice que la dueña le contestará personalmente al terminar el live |
| La dueña responde el chat ella misma | El bot se calla en ese chat por 30 min (configurable en `.env`) |
| Cliente manda solo fotos o audios | El bot no interviene; los ve la dueña después |
| Preguntas de otros temas | Redirige amablemente a temas de la tienda |

## ⚠️ Aviso importante

Este bot usa la conexión de **WhatsApp Web** de forma automatizada, que no es una
integración oficial de WhatsApp. Es lo que usan miles de negocios pequeños y en la
práctica funciona muy bien, pero WhatsApp podría restringir números que hagan spam.
Recomendaciones para no tener problemas:

- Úsenlo solo para **responder** a clientes que escriben primero (justo lo que hace este bot).
- No lo usen para enviar mensajes masivos ni publicidad.

(La alternativa 100 % oficial es la "WhatsApp Business Platform" de Meta, pero requiere
registro de empresa, aprobación de Meta y configuración técnica bastante mayor.)

## Problemas comunes

| Problema | Solución |
|---|---|
| "Falta la clave de la API" | Revisa que exista el archivo `.env` con tu `ANTHROPIC_API_KEY` |
| No aparece el QR / error de navegador | Ejecuta `npm install` de nuevo; en Linux puede faltar instalar Chrome |
| Se desconectó WhatsApp | Vuelve a ejecutar `npm start` (si pide QR otra vez, escanéalo) |
| Quiero que el bot se calle más/menos tiempo cuando respondo yo | Cambia `PAUSA_MINUTOS` en el archivo `.env` |
| El bot responde algo mal | Corrige o agrega esa información en `negocio.md` y reinicia el bot |
