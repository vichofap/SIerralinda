# 🛍️ Bot del live de TikTok — danaosth

Bot que **lee el chat del live de TikTok** de la tienda **danaosth** y responde
automáticamente las preguntas de los espectadores (precios, envíos, tallas, pagos...)
usando la inteligencia artificial de Claude.

## ⚠️ Importante: cómo responde el bot

TikTok **no permite** que un programa escriba mensajes en el chat del live
(no existe una forma oficial y las trampas pueden hacer que baneen la cuenta).

Por eso el bot funciona así:

1. Lee las preguntas del chat en tiempo real.
2. Genera la respuesta con la información de la tienda.
3. La muestra en un **panel web** que la vendedora tiene abierto mientras transmite,
   y opcionalmente **la lee en voz alta** 🔊.

👉 **Truco:** si activas "Leer respuestas en voz alta" y el micrófono de la
transmisión capta el audio de la computadora, los espectadores **escuchan** la
respuesta al instante, como si fuera una asistente en el live.

## Requisitos

- Una computadora con [Node.js](https://nodejs.org) instalado (versión 18 o más nueva).
- Una API key de Claude: se crea gratis en [console.anthropic.com](https://console.anthropic.com)
  (el uso de la API tiene un costo pequeño por respuesta; para un live normal suele ser de centavos).

## Instalación (solo la primera vez)

```bash
cd bot-tiktok
npm install
```

Luego:

1. Copia el archivo `.env.example` con el nombre `.env`.
2. Abre `.env` y pega tu API key de Claude donde dice `ANTHROPIC_API_KEY=`.
3. Abre `negocio.md` y **completa la información real de la tienda**:
   productos, precios, envíos, formas de pago, etc.
   ¡Este paso es el más importante! El bot solo sabe lo que está escrito ahí.

## Cómo usarlo en cada live

1. En la computadora, dentro de la carpeta `bot-tiktok`, ejecuta:

   ```bash
   npm start
   ```

2. Abre en el navegador: **http://localhost:3000**
3. Inicia el live en TikTok con la cuenta **@danaosth**.
   El bot detecta solo cuando empieza el live (revisa cada 30 segundos).
4. En el panel, activa **"🔊 Leer respuestas en voz alta"** si quieres que las
   respuestas se escuchen.

Cuando alguien pregunte algo en el chat ("¿cuánto cuesta?", "¿hacen envíos a...?"),
la respuesta aparece en el panel en 2-3 segundos.

## Qué NO responde el bot

- Saludos sueltos, emojis o spam (los ignora para no gastar dinero).
- Cosas que no estén en `negocio.md` — en ese caso dice amablemente que la
  vendedora lo responderá en el live, **nunca inventa precios**.
- Al mismo usuario más de una vez cada 20 segundos.

## Problemas comunes

| Problema | Solución |
|---|---|
| "Falta la clave de la API" | Revisa que exista el archivo `.env` con tu `ANTHROPIC_API_KEY` |
| "no está en vivo todavía" | Es normal: el bot espera y se conecta solo cuando empiece el live |
| No se escucha la voz | Activa la casilla 🔊 y sube el volumen; el navegador necesita que hagas un clic en la página primero |
| Quiero cambiar el usuario de TikTok | Edita `TIKTOK_USERNAME` en el archivo `.env` |
