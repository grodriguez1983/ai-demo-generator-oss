# AI Demo Generator

Turn a **declarative YAML flow** into a **narrated product-demo video**. The
pipeline records a real web app with Playwright, writes the narration with an
LLM from your hints, voices it with TTS, and renders the final video with
ffmpeg — branded intro/outro, burned-in subtitles, an animated guide-cursor,
and per-platform social clips.

```
Seed → Record (Playwright) → Script (LLM) → Voice (TTS) → Render (ffmpeg) → Social clips
```

Every video is one YAML file. There is no app-specific code: what the browser
does is fully described by the flow, so the same engine records any web app.

> This repo is built and governed with **Generative Specification (GS)**: a
> human authors the spec, the code is derived from it. The spec is the grammar,
> the code is one sentence in that grammar. See [`docs/spec/SPEC.md`](docs/spec/SPEC.md)
> (in Spanish, the method's language) and [`CLAUDE.md`](CLAUDE.md).

---

## Requirements

- **Node.js 20+**
- **ffmpeg** — `brew install ffmpeg` (macOS) · `apt install ffmpeg` (Debian/Ubuntu)
- An **OpenAI API key** — always needed, it writes the narration script
- An **ElevenLabs API key** — the default voice provider (its voices are far
  better than OpenAI's). To skip it, set `TTS_PROVIDER=openai` and use OpenAI's
  (more robotic) voices with just the OpenAI key.
- The app you want to record, reachable over HTTP (the bundled example uses a
  public site, so you need nothing of your own to try it)

## Setup

```bash
cp .env.example .env     # fill in OPENAI_API_KEY + ELEVENLABS_API_KEY (and BASE_URL)
npm install
npx playwright install chromium
```

By default voices come from **ElevenLabs** (set `ELEVENLABS_API_KEY`; the voice
defaults to the premade "Rachel", swap `ELEVENLABS_VOICE_ID` for any voice in
your library). Don't want a second account? Set `TTS_PROVIDER=openai` to use
OpenAI's voices with just the OpenAI key.

## Try the bundled example (no app of your own)

The example records against a public TodoMVC site, so it needs no app of your
own. In `.env`, set `BASE_URL=https://demo.playwright.dev` and your keys, then:

```bash
# 1. Cheap smoke test: records the flow, no LLM/TTS/render spend.
npx tsx src/index.ts --demo=example-playground --dry-run --skip-seed

# 2. Full pipeline: script + voice + render + clip.
npx tsx src/index.ts --demo=example-playground --skip-seed
```

Outputs land in `output/` (git-ignored, all regenerable):

| Folder | Contents |
|---|---|
| `output/final/` | Final clean video (branded intro/outro) + GIF |
| `output/clips/<id>/` | Per-platform clips with burned-in subtitles |
| `output/subtitles/<id>/` | `.srt` (upload as CC to YouTube) |
| `output/scripts/<id>.json` | Generated narration (text + per-segment timing) |
| `output/audio/` | One MP3 per segment |
| `output/videos/` | Raw Playwright recording (`.webm`) |
| `output/screenshots/` | One PNG per segment (for debugging the flow) |

## Command-line flags

```bash
npx tsx src/index.ts --demo=<id> [flags]
```

| Flag | Effect |
|---|---|
| `--demo=<id>` | Record the demo in `src/config/<id>.yaml` |
| `--dry-run` | Record only — skip script/voice/render (cheap flow check) |
| `--skip-seed` | Skip the seed stage (see `SEED_COMMAND`) |
| `--skip-record` | Reuse the existing recording (re-render only) |
| `--skip-script` | Reuse the existing `output/scripts/<id>.json` |
| `--skip-voice` | Reuse the existing audio |
| `--skip-render` / `--skip-clips` | Skip rendering / social clips |
| `--verbose` | Debug logging |

**Quality loop that works well:** `--dry-run` first (validate selectors and
pacing for free) → full run → open `output/scripts/<id>.json`, fix any segment
the LLM made generic → re-run `--skip-record --skip-script` to re-voice and
re-render in a minute or two.

## Writing a demo

A full, annotated reference is [`docs/playbooks/nuevo-demo.md`](docs/playbooks/nuevo-demo.md).
The shape:

```yaml
id: my-demo
title: "What the video shows"
description: "Context for the narration LLM (not narrated verbatim)"
duration_target_seconds: 60
locale: en

skip_login: true          # no app login; go straight to the pages
no_locale_prefix: true    # routes have no /<locale> prefix
cursor_guide: true        # animated guide-cursor (tutorial feel)

video_width: 1920         # 1920×1080 landscape, or 1080×1920 portrait (reels)
video_height: 1080
viewport_width: 1280      # browser viewport; upscaled to the video size in post
viewport_height: 720

narration_persona: "a calm product tutorial narrator"   # who the LLM "is"
narration_language: "English (US)"                       # defaults to locale
narration_wpm: 90
tts_provider: elevenlabs     # uses ELEVENLABS_VOICE_ID from .env
# tts_voice_id: "<id>"       # override the voice for this demo

segments:
  - id: step-one
    narration_hint: >-
      What you want this part to say. The LLM condenses it to fit the segment.
    pause_after_ms: 1000
    actions:
      - { type: navigate, path: /dashboard }
      - { type: wait, selector: "h1", timeout_ms: 15000 }
      - { type: click, selector: "button:has-text('New')" }

clips:
  platforms: [landscape]   # landscape / portrait / square / story
```

### Actions

| Action | Params | Notes |
|---|---|---|
| `navigate` | `path` or `url_var` | `path` is relative to `BASE_URL` (+ `/<locale>` unless `no_locale_prefix`) |
| `click` | `selector`, `force?`, `optional?` | uses `.first()`; animates the guide-cursor |
| `fill` / `type` | `selector`, `text` / `text_var`, `delay_ms?` | `type` presses key-by-key |
| `wait` | `selector?`, `ms?`, `timeout_ms?`, `optional?` | wait for a selector and/or a fixed time |
| `wait-url` | `pattern`, `timeout_ms` | URL glob |
| `select-combobox` | `selector`, `option`, `index?` | Radix/shadcn comboboxes |
| `scroll` / `scroll-to` | `distance` / `selector` | |
| `hover` | `selector`, `count?`, `pause_ms?` | point without clicking |
| `press-key` | `key` | e.g. `Enter`, `Escape` |
| `sleep` | `ms` | |
| `upload-file` | `selector`, `file` | sets files on an `<input type=file>` (even hidden) |
| `draw` | `selector`, `step_ms` | draw a stroke on a `<canvas>` (signature pads) |
| `read-value` / `read-text` / `read-url` | `selector`, `var` | capture live values for `*_var` reuse |

### Narration

- Each segment's `narration_hint` is the only source for its narration. The LLM
  condenses it to roughly fit the segment's on-screen duration — it won't invent
  marketing copy or restate the title.
- Prefer writing the hint the way you want it to *sound*. Set
  `verbatim_narration: true` to use the hint word-for-word (no LLM).
- `narration_persona` and `narration_language` steer the voice and tongue.

### Known traps (worth reading before your first real YAML)

- **Dual layouts** (hidden mobile cards + a desktop table): any `wait`/`click`
  on them needs `:visible` — Playwright waits for the *first* DOM match even if
  it's hidden, and hangs.
- **Cold routes in dev**: a dev server compiles each route on first visit
  (>20 s). Add a `hidden: true` warm-up segment that visits every route the flow
  touches, detail pages with real IDs included.
- **Live AI calls** in the app: put the wait in a `hidden: true` segment with a
  generous `timeout_ms` (90–180 s).
- **Confirmation dialogs** after a submit: target the button *inside* the dialog
  (`[role="dialog"] button:has-text(...)`).
- **Pacing**: a segment's window is its actions + `pause_after_ms`. For calm
  narration, pause 2–4× longer than feels necessary.

## Adapting it to your app

1. **Login** — the built-in step posts `DEMO_EMAIL`/`DEMO_PASSWORD` to
   `BASE_URL/<locale>/login` using the selectors in `src/config/selectors.ts`
   (`AUTH`). Adjust those if your login differs, or set `skip_login: true` and
   navigate yourself. The login is recorded but trimmed from the final video.
2. **Known state** — recording assumes deterministic data. Point `SEED_COMMAND`
   (in `.env`) at an idempotent seed command your app provides; it runs before
   recording. Empty = no seed.
3. **Branding** — set the global `branding` block in `src/config/demos.yaml`
   (intro/outro text, colors, optional `logo_path` under `assets/`), or override
   per demo, or drop it with `skip_branding: true`.

## Project layout

```
src/
  index.ts              CLI entry (flag parsing)
  pipeline/             the six stages: seed → record → script → voice → render → clips
  flows/                base-flow (login + recording), declarative-flow (the engine), cursor-guide
  config/               constants.ts (schemas), selectors.ts, demos.yaml, <demo>.yaml
  utils/                ffmpeg, html-slide, srt, timing, logger, openai-client, file-utils
docs/
  spec/SPEC.md          the GS specification (what is produced + the rules)
  decisions/            why the repo is shaped the way it is
  playbooks/            how to author a new demo
```

## License

MIT — see [`LICENSE`](LICENSE).
