# SPEC — AI Demo Generator

> La **especificación** de esta herramienta: qué produce y las reglas que lo
> atan. El código (`src/`) se *deriva* de este documento, no al revés. Si el
> código y el SPEC no coinciden, el bug está en uno de los dos y se decide acá.
>
> Esta herramienta se construye con **Especificación Generativa (GS)**: el
> humano autora la spec, la IA deriva el código. El SPEC es la gramática; cada
> video es una oración en esa gramática.

---

## 1) Qué se produce

Un **video demo narrado de un producto**, a partir de **un archivo YAML**. De
ese YAML salen, de forma repetible:

- el video final limpio (intro/outro brandeado) + un GIF,
- clips por plataforma con subtítulos quemados,
- el `.srt` para subir como CC,
- el guion generado (texto + timing por segmento),
- un MP3 por segmento y la grabación cruda.

**Una pieza = un YAML.** No hay código específico por app: lo que el browser
hace está descrito por completo en el YAML. El mismo motor graba cualquier web.

## 2) El pipeline (seis etapas)

```
Seed → Record → Script → Voice → Render → Clips
```

1. **Seed** — deja la app en un estado conocido. Es un *puerto*: un comando que
   la app provee (`SEED_COMMAND`). Vacío = no-op.
2. **Record** — Playwright ejecuta las `actions` del YAML y graba el `.webm`,
   con marcadores de tiempo por segmento.
3. **Script** — un LLM escribe la narración de cada segmento *desde su
   `narration_hint`*, condensada a la duración real del segmento.
4. **Voice** — TTS (OpenAI o ElevenLabs) locuta cada segmento.
5. **Render** — ffmpeg arma el final: recorta el login, sincroniza el audio a
   los marcadores, agrega intro/outro.
6. **Clips** — genera los cortes por plataforma con subtítulos.

Cada etapa se puede saltear (`--skip-*`) para iterar barato.

## 3) Las reglas que lo atan (inviolables)

- **El `narration_hint` es la única fuente de la narración.** El LLM condensa el
  hint; **no** inventa frases de marketing, **no** repite el título, **no**
  resume el demo entero. Si una pieza necesita texto exacto, `verbatim_narration: true`.
- **El audio no desborda el segmento.** La ventana de un segmento son sus
  `actions` + `pause_after_ms`. La narración se escribe para entrar ahí (regla
  práctica: ~1.5–2.0 palabras/segundo de ventana).
- **Todo en `output/` es regenerable.** Nada que esté solo en `output/` es
  fuente de verdad; la fuente es el YAML + la grabación.
- **Honestidad primero.** El video muestra el producto real haciendo lo que la
  narración dice. Si la app no puede hacer algo, no se narra que lo hace.

## 4) La IA nunca

- **Nunca** narra algo que la grabación no muestra (sin over-claim: lo que se
  ve es lo que la app hace de verdad).
- **Nunca** cambia el motor del pipeline para forzar que una pieza “quede bien”
  sin registrar una decisión en `docs/decisions/`. Primero se corrige el YAML.
- **Nunca** mete credenciales, claves ni datos de un cliente en un YAML, un
  commit o el repo. `.env` nunca se commitea.
- **Nunca** inventa una métrica. Los números que aparezcan en pantalla salen de
  la app, no del guion.

## 5) Quality gates (nada se publica sin pasar esto)

1. **`--dry-run`**: la grabación corre entera, los selectores resuelven y el
   `.webm` + los screenshots por segmento muestran el flujo correcto.
2. **Revisar `output/scripts/<id>.json`**: ningún segmento quedó genérico ni
   perdió el contenido del hint; el audio entra en su ventana.
3. **Mirar el video final**: intro/outro correctos, subtítulos legibles, el
   login recortado, el audio en sync con la acción.
4. Recién ahí se entrega/publica.

## 6) Las 7 propiedades de una buena spec (el molde)

Una pieza (y esta herramienta) se mide contra estas propiedades:

| Propiedad | Predicado — se cumple cuando… |
|---|---|
| **Documentada** | el YAML + el SPEC alcanzan para reproducir la pieza sin re-explicarla. |
| **Organizada** | hay un lugar para cada cosa (un YAML por demo, `output/` regenerable, decisiones en su carpeta). |
| **Acotada** | cada pieza es un archivo chico y legible; si crece, se rutea, no se infla. |
| **Auditable** | el *porqué* de cada elección vive en `docs/decisions/`. |
| **Verificable** | existe un gate que cualquiera puede correr (`--dry-run`, revisar el JSON, mirar el final). |
| **Ejecutable** | la spec corre: `npx tsx src/index.ts --demo=<id>` produce el artefacto. |
| **Honesta** | lo que se muestra es lo que el producto hace; lo pendiente se marca, no se disimula. |

> Regla de oro (**Acotado**): mantené cada archivo chico. Si una explicación
> crece, mandala a un doc y dejá un puntero — no infles el SPEC.
