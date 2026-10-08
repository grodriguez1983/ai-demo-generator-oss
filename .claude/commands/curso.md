---
description: Producir un tutorial largo end-to-end (16:9, pantallas sincronizadas con la voz, artefacto real)
argument-hint: <tema del video> [id]
---

Producí un tutorial largo con pantallas. NO re-expliques el proceso; ejecutalo.

1. Leé `docs/spec/SPEC.md`, `CLAUDE.md` y `docs/playbooks/tutorial-largo.md`. Confirmá en una línea que los leíste.
2. Si hay un video anterior de la serie, mirá su cierre: lo que prometió es el contrato de este.
3. **Construí/extendé el artefacto real ANTES del guion.** Todo lo que vaya a pantalla tiene que correr: tests, comandos, errores. Un commit por paso — el historial es la evidencia que el video ofrece.
4. **Ejecutá los experimentos de verdad.** Los números del guion salen de esas corridas. Si el experimento sale distinto de lo esperado, gana el experimento.
5. Escribí el guion con la estructura pedagógica del playbook §2 (contrato, tablero, checkpoints auto-verificables, preguntas de predicción, recap, cierre honesto declarando lo que NO se resolvió). Hacé la pasada de lenguaje (§2b).
6. **GATE:** corré `/auditar` sobre el guion con panel educativo, pasándole la ruta del artefacto real. Aplicá y escribí la v2.
7. Autorá las pantallas con un script sobre `tools/gen-screens.py` (pizarra/editor/terminal/tablero) que emita también el YAML. Un `.now` ámbar por pantalla; un beat, una pantalla.
8. **GATE visual:** `node tools/gate-visual.mjs <id> <N>`. Overflow, paleta, emojis de color, solapamientos. Mostrame muestras.
9. Pasada 1 (con `BASE_URL`), **verificá cada toma**: `bash tools/verify-takes.sh <id>` y `bash tools/verify-audio.sh <id>`. Regenerá las cortadas con `tools/regen-take.py`. Después `calibrate-audio.py` → pasada 2.
10. Verificá el mp4 (1920×1080, audio sano, frames de control) y corré el gate de primera impresión (§7b) antes de darlo por terminado.

Entrada: $ARGUMENTS
