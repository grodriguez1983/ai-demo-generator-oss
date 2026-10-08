# Playbook — Producir un tutorial largo (long-form 16:9 con pantallas)

Receta repetible para un video educativo de 10–16 min cuya imagen son **pantallas
diseñadas** (no la UI de una app), sincronizadas con la voz. La regla que manda
sobre todo lo demás: **nada aparece en pantalla que no exista y corra de verdad.**

Herramientas: `tools/gen-screens.py` (pantallas), `tools/serve-screens.ts`,
`tools/gate-visual.mjs`, `tools/calibrate-audio.py`, `tools/verify-takes.sh`,
`tools/verify-audio.sh`, `tools/regen-take.py`. Comando: `/curso <tema> [id]`.

---

## 0. Entrada
- Un tema y su lugar en la serie. Si el video anterior prometió algo en su
  cierre, **eso es el contrato**: este video lo cumple.
- Un id corto (`mi-tutorial`). Las pantallas y el YAML se generan con ese id.

## 1. Construí el artefacto real ANTES de escribir el guion
El paso que más cuesta y el que hace que el video sea honesto.
- Todo lo que el guion vaya a mostrar tiene que **correr**: los tests, el
  comando, los errores, la salida de la terminal.
- Los experimentos se **ejecutan de verdad** (idealmente con agentes en sesión
  limpia). El resultado real —incluidos los números— es lo que se dice.
- **Un commit por paso/movimiento**, con el hallazgo en el mensaje. El historial
  de git ES la evidencia que el video ofrece.
- Si un experimento sale distinto de lo esperado, **gana el experimento**: se
  reescribe el guion, no el resultado.

## 2. Guion
- **Estructura pedagógica:** contrato del video ("hoy X; cada paso, su demo") ·
  tablero de progreso visible que se tilda en vivo (`tablero()`) · bloques para
  agrupar (no listas planas de 7) · **checkpoint auto-verificable por paso**
  ("hacelo y mirá si X: si pasa, funcionó") · preguntas de predicción antes de
  cada demo caliente · recap a mitad · honestidad en el cierre.
- **Glosá cada término técnico la primera vez que aparece.** Asumir memoria del
  video anterior deja afuera a quien entra por búsqueda.
- Los números son los **reales de la corrida**. Sin excepción (SPEC §3).
- Cerrá declarando lo que el video **no** resolvió.

### 2a. Vocabulario (si el público ya es técnico)
1. **Mecanismo primero, nombre después y opcional.** "Una estructura que la
   herramienta lee para ubicarse — nosotros le decimos *X*." Nunca al revés.
2. **Un nombre se gana con uso:** menos de 3 apariciones → va sin nombre.
3. **Si existe el término de la industria, se dice y se acredita.** Es lo que
   **baja** la barrera del experto.
4. **Prohibido definir una palabra rara en cámara.** Si necesita definición,
   está mal elegida.
5. **Número + título en criollo, siempre juntos.** "Paso seis" solo es críptico;
   va "paso seis: el freno que recuerda". El tablero muestra el mismo título.

### 2b. Pasada de lenguaje (antes de la auditoría)
La palabra que la IA propone por default **no es la final**. Releé el guion
cazando: palabras rebuscadas con equivalente llano · frases de tres
subordinadas · el mismo conector repetido · cualquier término que necesite
definirse. Es una pasada sola, sobre texto, y la más barata de todas.

## 3. Auditoría con agentes (GATE — antes de gastar TTS)
Corré `/auditar` sobre el guion con panel **educativo**, pasándole la ruta del
artefacto real: el agente que puede **ejecutar** es el que encuentra los
defectos caros. Aplicá y escribí la v2. Detalle: `auditoria-con-agentes.md`.

## 4. Pantallas (16:9)
- Autoralas en un script que use los helpers de `tools/gen-screens.py`
  (`pizarra`/`editor`/`terminal`/`tablero`). **Las pantallas son artefactos de
  build: no se editan a mano, se regeneran.** El mismo script emite el HTML **y**
  el YAML del demo, así narración y pantalla no se desincronizan nunca.
- **Tres plantillas que se alternan** cada 30–60 s: **pizarra** (una frase),
  **editor** (código real con su ruta visible), **terminal** (salidas REALES
  copiadas de la corrida).
- **Un foco por pantalla (`.now` ámbar):** el único elemento que la voz nombra en
  ese segundo. **Un beat, una pantalla:** si un bloque se explica en tres
  momentos, son tres pantallas con el ámbar en tres lugares — nunca una pantalla
  estática 90 s. Si no podés decir qué va en ámbar, hay demasiado en la pantalla.
- **Diagramá lo que la prosa repite.** Si un concepto necesita dos pasadas de
  locución para entenderse, no le falta explicación: le falta un dibujo (SVG
  inline, sin librerías).
- **El texto entra animado, sincronizado con la voz.** Ninguna pantalla aparece
  completa y quieta: cada palabra/línea/fila hace su reveal y el conjunto se
  reparte sobre la duración real hablada (decisión 0005). Por eso se regenera
  **después** de la pasada 1 de voz: así `build()` lee el mp3 y calza el reveal.
- El tema visual se cambia editando los tokens de `assets/screens/theme.css`.

## 5. Gate visual (antes de gastar TTS)
```
PORT=5599 npx tsx tools/serve-screens.ts &
node tools/gate-visual.mjs <id> <N>      # screenshots + detección de overflow
```
Revisá a ojo lo que el script no mide: paleta, emojis de color (rompen el tema),
solapamientos con el tablero, y legibilidad.

## 6. Voz, verificación y sincronía (dos pasadas)
```
export BASE_URL=http://127.0.0.1:5599
# pasada 1: graba + genera la voz (sin render)
npx tsx src/index.ts --demo=<id> --skip-seed --skip-render --skip-clips
```
**Verificá CADA toma (GATE).** Las voces expresivas cortan tomas de vez en
cuando — y cortan el final, que es donde vive el CTA.
```
bash tools/verify-takes.sh <id>     # whisper: transcribe y compara contra el texto
bash tools/verify-audio.sh <id>     # baches, volumen, clipping, velocidad
```
Una toma marcada se regenera sola, sin re-correr la pasada:
```
python3 tools/regen-take.py <id> <seg-id>
```
Después, calibrá la sincronía y grabá la pasada 2:
```
python3 tools/calibrate-audio.py <id>                 # SIEMPRE entre pasada 1 y 2
npx tsx src/index.ts --demo=<id> --skip-seed --skip-voice   # re-graba calibrado + render
```
> La pasada 2 vuelve a grabar: una corrección de pantalla hecha antes del render
> entra igual.

## 7. Verificar el mp4 (GATE)
`ffprobe` → **1920×1080**, audio AAC, duración esperada. Chequeá volumen medio,
que no haya silencios largos, y 3–4 frames de control en distintos minutos.

## 7b. Gate de primera impresión (post-render, antes de validar)
El panel de 3 auditores audita **texto y código**: ninguno mira y escucha el mp4.
Antes de dar por terminado:
1. Corré `tools/verify-audio.sh` sobre las tomas finales (baches, "alien",
   velocidad — medidos).
2. **Un auditor nuevo, con el mp4 en la mano**, que **no** participó del guion:
   ¿qué palabra te sacó del video? ¿dónde retrocediste? ¿qué pantalla no te dijo
   dónde mirar? ¿qué parte va demasiado rápido?
3. Lo que salga se arregla o se declara. **El cierre y el recap se revisan
   siempre**: es donde la locución acelera.

## 8. Validación
Mirá el video final completo antes de publicarlo. Lo que el panel encontró y no
se pudo arreglar, va a la nota de producción como caveat declarado.

## Checklist
- [ ] el artefacto real construido, corriendo, con un commit por paso
- [ ] vocabulario: mecanismo antes que nombre · término de industria acreditado ·
      ninguna palabra rara definida en cámara · cada paso con número **y** título
- [ ] pasada de lenguaje hecha (sobre texto, antes de la auditoría)
- [ ] auditoría con 3 agentes aplicada; hallazgos técnicos arreglados en el artefacto
- [ ] gate visual: overflow, paleta, emojis, solapamientos
- [ ] un `.now` ámbar por pantalla con código, un beat una pantalla
- [ ] **cada toma TTS transcrita y verificada** (verify-takes + verify-audio)
- [ ] calibración corrida entre pasada 1 y 2
- [ ] mp4 1920×1080, audio sano, frames de control
- [ ] gate de primera impresión corrido sobre el mp4 antes de validar
