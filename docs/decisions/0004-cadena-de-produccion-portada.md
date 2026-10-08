# 0004 — La cadena de producción completa, portada y genérica

**Estado:** aceptada · **Fecha:** 2026-10-07

## Contexto
La extracción inicial (decisión 0001) dejó el motor del pipeline, pero no las
herramientas que hacen que un video *estilo tutorial* salga bien: generar las
pantallas animadas, sincronizarlas con la voz, y verificar que no haya cortes ni
baches. Esas herramientas vivían repartidas entre los dos repos originales y
estaban pegadas al molde de marca (negro+oro) y a nombres de piezas concretas.
El objetivo de este repo es que **quien lo clona tenga todo** para reproducir ese
flujo, no solo grabar una app.

## Decisión
Se portan a `tools/`, en versión genérica (tema neutro, sin referencias de
marca), las siete herramientas de la cadena:

- `serve-screens.ts` — sirve `assets/screens/` para grabar pantallas.
- `gen-screens.py` — genera las pantallas (helpers pizarra/editor/terminal/
  tablero) **y** el YAML del demo. Tema en `assets/screens/theme.css`
  (rebrandeable por tokens `:root`).
- `calibrate-audio.py` — fija el `sleep` de cada segmento = duración del audio
  (la sincronía de dos pasadas).
- `gate-visual.mjs` — screenshots + detección de overflow antes de gastar TTS.
- `verify-takes.sh` — transcribe cada toma con whisper y detecta cortes.
- `verify-audio.sh` — baches, volumen, clipping, velocidad de habla.
- `regen-take.py` — regenera una sola toma cortada por ElevenLabs.

Se portan además, en versión genérica, las skills `/auditar` (panel de 3 agentes)
y `/curso` (tutorial largo) con sus playbooks.

Lo que **no** se portó: el pipeline de herencia/parches entre versiones de pieza
(era específico de la producción de su serie), el molde negro+oro, las voces
clonadas, los nombres de piezas y las referencias a decisiones internas.

## Consecuencias
- La cadena de pantallas corre de punta a punta sin API keys hasta la grabación
  (probado: `gen-screens` → `serve-screens` → `gate-visual` sin overflow →
  `--dry-run` graba las 6 pantallas). Voz/calibración/render necesitan las keys.
- Las pantallas son **artefactos de build**: se regeneran, no se editan a mano.
- Las herramientas leen `output/` (regenerable) y son idempotentes: se pueden
  correr las veces que haga falta.
- `verify-takes.sh` depende de whisper.cpp; es el único gate con dependencia
  externa, y está declarado en el README.
