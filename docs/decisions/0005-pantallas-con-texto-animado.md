# 0005 — Las pantallas nunca son estáticas: el texto entra animado, sincronizado con la voz

**Estado:** aceptada · **Fecha:** 2026-10-07

## Contexto
El camino de pantallas (`tools/gen-screens.py` + `assets/screens/theme.css`)
generaba slides donde el texto aparecía **completo y de golpe** y se quedaba
quieto durante todo el `sleep` del segmento. El playbook ya pedía "un beat, una
pantalla" (§4 de `tutorial-largo.md`), pero dentro de una pantalla el texto no
acompañaba a la locución: aparecía todo antes de que la voz lo dijera. Se ve
plano y rompe la sensación de que la narración y la imagen son la misma cosa.

## Decisión
El texto de cada pantalla **entra animado y el reveal se reparte sobre la
duración real hablada** de ese segmento. Es una propiedad del **motor de
pantallas**, no de una pieza: cualquier demo generado la hereda.

- Cada "unidad de reveal" (una palabra de la frase, un acento completo, una línea
  de código, una fila del tablero) se envuelve con clase `.rv`/`.rvb` y un índice
  `--k`. `gen-screens.py` las numera en orden de lectura.
- `build()` fija un `--step` por pantalla de modo que todas las unidades terminan
  de aparecer en ~55 % del tiempo hablado (el resto la pantalla se sostiene
  legible). La animación vive en `@keyframes reveal` de `theme.css`.
- **Sincronía con la voz real:** si el segmento ya fue locutado,
  `build()` lee la duración del mp3 con `ffprobe` y reparte el reveal sobre ese
  valor; si todavía no hay audio, cae a una estimación por WPM. Por eso el flujo
  es: generar → pasada 1 (voz) → **regenerar** (ahora con audio) → pasada 2.
- Para que nada quede 100 % congelado durante el hold: shimmer lento del acento
  (`.g`) y deriva sutil del fondo (`.screen::before`). Ambos se apagan con
  `prefers-reduced-motion`.

## Alternativas descartadas
- **Sync palabra-por-palabra con timestamps del TTS.** Daría karaoke perfecto,
  pero exige timing por palabra del proveedor y acopla el motor a cada TTS. El
  reveal repartido sobre la duración del mp3 da la misma lectura sin ese acople.
- **Animar en el render (ffmpeg/overlays).** Metería la animación en el motor del
  pipeline (`src/`) y lo volvería específico. La animación es de la **pantalla**;
  vive en su capa (HTML/CSS), que es un artefacto de build regenerable.

## Consecuencias
- Las pantallas son artefactos de build: **se regeneran, no se editan a mano**
  (sigue valiendo). La animación es determinística: mismo deck + mismo audio →
  mismo reveal.
- `calibrate-audio.py` sigue siendo compatible; con `build()` leyendo el audio,
  el `sleep` del YAML ya queda calzado a la voz al regenerar tras la pasada 1.
- Verificable: el gate visual (`gate-visual.mjs`) toma el screenshot tras el
  reveal, así que overflow/paleta se siguen midiendo igual.
