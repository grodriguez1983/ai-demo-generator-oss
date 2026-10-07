# Playbook — Autorar un demo nuevo

Receta ejecutable. El vocabulario de acciones y el detalle de campos está en el
[`README.md`](../../README.md); acá va el **proceso**, paso a paso. Referencia
viva y anotada: `src/config/example-playground.yaml`.

## 0) Antes de escribir
- Decidí el formato: **landscape** 1920×1080 (tutorial, viewport 1280×720) o
  **portrait** 1080×1920 (reel, viewport 540×960 → layout mobile).
- Tené la app corriendo y accesible en `BASE_URL` (o grabá una web pública con
  `skip_login: true`).

## 1) Esqueleto
Creá `src/config/<id>.yaml` con un segmento. Campos mínimos: `id`, `title`,
`description`, `duration_target_seconds`, `locale`, `segments`. Copiá del
ejemplo y recortá.

## 2) Escribí el flujo como `actions`
Cada segmento es un paso narrativo. Dentro, una lista de `actions` que lo
ejecutan. Regla práctica:
- **Primer segmento:** `navigate` + un `wait` por un selector que confirme que
  la página cargó.
- **Rutas frías en dev** (Next/Vite compilan en la primera visita, >20 s):
  agregá un segmento `hidden: true` de *warmup* que visite todas las rutas del
  flujo, incluidas las de detalle con IDs reales.
- **Esperas de IA de la app:** en un segmento `hidden: true` con `timeout_ms`
  generoso (90–180 s).
- **Layouts duales** (cards mobile + tabla desktop): `wait`/`click` siempre con
  `:visible`.

## 3) Escribí los `narration_hint`
Escribilos como querés que **suenen**. El LLM los condensa a la duración real
del segmento (no inventa, no repite el título). Si necesitás texto exacto,
`verbatim_narration: true`. Afiná la voz con `narration_persona` y
`narration_language`.

## 4) Validá gratis
```bash
npx tsx src/index.ts --demo=<id> --dry-run --skip-seed
```
Mirá `output/videos/<id>.webm` y los PNG en `output/screenshots/`: ¿el flujo
hace lo que la narración va a decir? Corregí selectores y pacing acá, sin gastar.

## 5) Corrida completa y gate de guion
```bash
npx tsx src/index.ts --demo=<id> --skip-seed
```
Abrí `output/scripts/<id>.json`. ¿Algún segmento quedó genérico o perdió el
contenido del hint? Corregí el texto a mano (regla: ~1.5–2.0 palabras/seg de
ventana; el audio no debe desbordar el segmento).

## 6) Re-render rápido
```bash
npx tsx src/index.ts --demo=<id> --skip-record --skip-script
```
Re-locuta y re-renderiza sobre la misma grabación en 1–2 min.

## 7) Gate final
Mirá el video de `output/final/`: intro/outro ok, subtítulos legibles, login
recortado, audio en sync. Recién ahí se entrega.

> **Acotado:** una pieza es un archivo. Si tu YAML se vuelve inmanejable, es
> señal de que son dos demos, no uno.
