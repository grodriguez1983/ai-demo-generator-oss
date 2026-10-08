# CLAUDE.md — AI Demo Generator

> **Este archivo es el mapa; [`docs/spec/SPEC.md`](docs/spec/SPEC.md) es la gramática.**
> `AGENTS.md` es una copia idéntica para herramientas que buscan ese nombre.
> Herramienta construida con **Especificación Generativa**: el humano autora la
> spec, la IA deriva el código. Documentada, organizada, repetible.

## Leé antes de producir (en orden)
1. [`docs/spec/SPEC.md`](docs/spec/SPEC.md) — qué se produce y las reglas que lo atan.
2. Este archivo — cómo está organizado el repo y cómo se rutea cada tarea.
3. [`README.md`](README.md) — la operación completa (setup, flags, acciones).

Confirmá en una línea que leíste los tres **antes de tocar nada**.

---

## 1) Qué es esto
Un pipeline que convierte **un YAML declarativo** en un **video demo narrado**:
Playwright graba → un LLM escribe el guion desde los `narration_hint` → TTS lo
locuta → ffmpeg renderiza (intro/outro, subtítulos, clips). **Una pieza = un
YAML.** No hay código específico por app: lo que el browser hace está todo en el
YAML, interpretado por `DeclarativeFlow`.

## 2) Secuencia de herramientas (cuándo usar cuál)
| Necesito… | Voy a… |
|---|---|
| Entender qué produce la herramienta y sus reglas | [`docs/spec/SPEC.md`](docs/spec/SPEC.md) |
| Autorar un demo de una app (grabación real) | [`docs/playbooks/nuevo-demo.md`](docs/playbooks/nuevo-demo.md) (o `/nuevo-demo`) |
| Producir un **tutorial largo con pantallas** (16:9, voz sincronizada) | [`docs/playbooks/tutorial-largo.md`](docs/playbooks/tutorial-largo.md) (o `/curso`) |
| **Auditar un guion antes de producirlo** (gate, antes de gastar TTS) | [`docs/playbooks/auditoria-con-agentes.md`](docs/playbooks/auditoria-con-agentes.md) (o `/auditar`) |
| Generar/servir pantallas animadas · gates de audio · calibrar sync | `tools/` (ver README §"The screen path") |
| Ver ejemplos que corren | `src/config/example-playground.yaml` (app) · `src/config/screens-demo.yaml` (pantallas) |
| Las acciones disponibles / setup / flags | [`README.md`](README.md) |
| El esquema exacto de un demo (campos, validación) | `src/config/constants.ts` |
| El porqué de una decisión de diseño | [`docs/decisions/`](docs/decisions/) |

## 3) Restricciones inviolables (la IA nunca)
- **Nunca** narra algo que la grabación no muestra. Lo que se ve es lo que la
  app hace de verdad (sin over-claim — ver SPEC §"La IA nunca").
- **Nunca** modifica el **motor** del pipeline (`src/pipeline/`, `src/flows/`)
  para que una pieza "quede bien" sin registrar una decisión en `docs/decisions/`.
  El problema de una pieza se arregla en **su YAML** primero.
- **Nunca** publica una pieza sin pasar los **quality gates** (SPEC §5):
  `--dry-run` → revisar `output/scripts/<id>.json` → mirar el final.
- **Nunca** commitea `.env`, claves, ni datos de un cliente. `output/` queda
  fuera de git (todo regenerable).
- **Nunca** inventa una métrica: los números en pantalla salen de la app.

## 4) Ruteo — dónde vive cada cosa
- La gramática (qué/reglas) → `docs/spec/SPEC.md`
- El motor (código derivado) → `src/pipeline/` (etapas) + `src/flows/` (grabación)
- El esquema de un demo → `src/config/constants.ts`
- Demos (una pieza = un archivo) → `src/config/<id>.yaml`
- Config compartida (branding, defaults) → `src/config/demos.yaml`
- Recetas ejecutables → `docs/playbooks/`
- El porqué de las decisiones (Auditable) → `docs/decisions/`
- Salida regenerable (videos, audio, guiones, clips) → `output/` (fuera de git)

## 5) Flujo de calidad (el que da mejores resultados)
1. **`--dry-run`** primero: valida selectores y pacing sin gastar en LLM/TTS.
2. Corrida completa.
3. **Revisar `output/scripts/<id>.json`** y corregir a mano el segmento que
   quedó genérico.
4. Re-correr `--skip-record --skip-script`: re-locuta y re-renderiza en 1–2 min.

> Regla de oro (propiedad **Acotado**): mantené este archivo chico; se relee en
> cada sesión. Si crece, ruteá a un archivo, no lo infles.
