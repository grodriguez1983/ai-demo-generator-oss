import { z } from 'zod';

// ── Environment Schema ──────────────────────────────────────────────
export const envSchema = z.object({
  BASE_URL: z.string().url().default('http://localhost:3000'),
  OPENAI_API_KEY: z.string().min(1),
  // Credentials for the demo user, used by the built-in login step. Only needed
  // for demos that log in (i.e. not `skip_login: true`); safe defaults otherwise.
  DEMO_EMAIL: z.string().default('demo@example.com'),
  DEMO_PASSWORD: z.string().default('demo'),
  TTS_MODEL: z.string().default('gpt-4o-mini-tts'),
  TTS_VOICE: z.enum([
    'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable',
    'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar',
  ]).default('alloy'),
  // ── Voice provider ──────────────────────────────────────────────
  // Default is ElevenLabs (far better voices). OpenAI TTS is the fallback that
  // needs no extra account — set TTS_PROVIDER=openai to use it.
  TTS_PROVIDER: z.enum(['openai', 'elevenlabs']).default('elevenlabs'),
  ELEVENLABS_API_KEY: z.string().optional(),
  // Defaults to "Rachel", a premade ElevenLabs voice available on every account
  // (so the pipeline works with just an API key). Swap for any voice id from
  // your ElevenLabs library.
  ELEVENLABS_VOICE_ID: z.string().default('21m00Tcm4TlvDq8ikWAM'),
  ELEVENLABS_MODEL: z.string().default('eleven_multilingual_v2'),
  VIDEO_WIDTH: z.coerce.number().int().positive().default(1280),
  VIDEO_HEIGHT: z.coerce.number().int().positive().default(720),
  VIDEO_FPS: z.coerce.number().int().positive().default(30),
  GIF_FPS: z.coerce.number().int().positive().default(10),
  GIF_WIDTH: z.coerce.number().int().positive().default(640),
});

export type EnvConfig = z.infer<typeof envSchema>;

// ── Video Constants ─────────────────────────────────────────────────
export const VIDEO_CODEC = 'libx264';
export const VIDEO_PRESET = 'fast';
export const VIDEO_CRF = 22;
export const AUDIO_CODEC = 'aac';
export const GIF_LANCZOS_FLAGS = 'lanczos';

/** Approximate words per minute for Spanish narration */
export const NARRATION_WPM = 150;

/** Default pause after each action in ms */
export const DEFAULT_PAUSE_MS = 1500;

/** Max GIF file size target in bytes (5MB) */
export const MAX_GIF_SIZE_BYTES = 5 * 1024 * 1024;

// ── Output Paths ────────────────────────────────────────────────────
export const OUTPUT_DIR = 'output';
export const VIDEOS_DIR = `${OUTPUT_DIR}/videos`;
export const AUDIO_DIR = `${OUTPUT_DIR}/audio`;
export const SCRIPTS_DIR = `${OUTPUT_DIR}/scripts`;
export const FINAL_DIR = `${OUTPUT_DIR}/final`;
export const SCREENSHOTS_DIR = `${OUTPUT_DIR}/screenshots`;
export const CLIPS_DIR = `${OUTPUT_DIR}/clips`;
export const SUBTITLES_DIR = `${OUTPUT_DIR}/subtitles`;

// ── Social Platform Definitions ────────────────────────────────────
export interface PlatformSpec {
  width: number;
  height: number;
  maxDurationSec?: number;
  subtitleFontSize: number;
  /** Margen inferior de subtítulos (px), por encima de la UI superpuesta de cada red. */
  subtitleMarginV?: number;
}

export const SOCIAL_PLATFORMS: Record<string, PlatformSpec> = {
  landscape: { width: 1920, height: 1080, subtitleFontSize: 36, subtitleMarginV: 90 },
  // Reels/Stories reservan ~320px inferiores para CTA/caption de Instagram.
  portrait: { width: 1080, height: 1920, subtitleFontSize: 32, subtitleMarginV: 360 },
  square: { width: 1080, height: 1080, subtitleFontSize: 28, subtitleMarginV: 150 },
  story: { width: 1080, height: 1920, maxDurationSec: 15, subtitleFontSize: 32, subtitleMarginV: 360 },
};

// ── Branding & Clip Schemas ────────────────────────────────────────
export const brandingSchema = z.object({
  brand_name: z.string().optional(),
  logo_path: z.string().optional(),
  bg_gradient: z.string().optional(),
  primary_color: z.string().default('#1E40AF'),
  secondary_color: z.string().default('#FFFFFF'),
  intro_text: z.string().default('My Product'),
  outro_text: z.string().default('Request a demo'),
  outro_url: z.string().optional(),
  font: z.string().default('Arial'),
  intro_duration_sec: z.number().default(2.5),
  outro_duration_sec: z.number().default(3),
});

export type Branding = z.infer<typeof brandingSchema>;

export const hookChatMessageSchema = z.object({
  from: z.string().optional(),
  text: z.string(),
  time: z.string().optional(),
  out: z.boolean().default(false),
});

export type HookChatMessage = z.infer<typeof hookChatMessageSchema>;

export const highlightClipSchema = z.object({
  id: z.string(),
  label: z.string(),
  segments: z.array(z.string()),
  platforms: z.array(z.string()).optional(),
  // 'branded': slide corporativa con gradiente/logo (default).
  // 'pain': mockup de chat estilo WhatsApp + texto grande del dolor, sin marca —
  // la identificación del espectador viene de ver su problema, no del logo.
  hook_style: z.enum(['branded', 'pain']).default('branded'),
  hook_chat_title: z.string().optional(),
  hook_chat: z.array(hookChatMessageSchema).default([]),
  hook_lines: z.array(z.string()).default([]),
  hook_eyebrow: z.string().optional(),
  hook_title: z.string().optional(),
  hook_description: z.string().optional(),
  hook_duration_sec: z.number().default(2),
  transition_text: z.string().optional(),
  hook_narration: z.string().optional(),
});

export const clipConfigSchema = z.object({
  generate_full: z.boolean().default(true),
  platforms: z.array(z.string()).default(['landscape', 'portrait', 'square']),
  highlights: z.array(highlightClipSchema).default([]),
});

export type HighlightClip = z.infer<typeof highlightClipSchema>;
export type ClipConfig = z.infer<typeof clipConfigSchema>;

// ── Declarative Action Schemas ───────────────────────────────────────
const navigateActionSchema = z.object({
  type: z.literal('navigate'),
  path: z.string().optional(),
  // Navegar a una URL absoluta capturada antes con read-value/read-text.
  url_var: z.string().optional(),
});

const clickActionSchema = z.object({
  type: z.literal('click'),
  selector: z.string(),
  force: z.boolean().optional(),
  optional: z.boolean().default(false),
});

const fillActionSchema = z.object({
  type: z.literal('fill'),
  selector: z.string(),
  text: z.string(),
});

const typeActionSchema = z.object({
  type: z.literal('type'),
  selector: z.string(),
  text: z.string().optional(),
  // Tipear el contenido de una variable capturada con read-value/read-text.
  text_var: z.string().optional(),
  delay_ms: z.number().int().positive().default(50),
});

// Captura el value de un input (read-value) o el textContent (read-text) en
// una variable reutilizable por navigate.url_var / type.text_var. Permite
// flujos con datos dinámicos (ej: link + PIN generados en vivo por la app).
const readValueActionSchema = z.object({
  type: z.literal('read-value'),
  selector: z.string(),
  var: z.string(),
});

const readTextActionSchema = z.object({
  type: z.literal('read-text'),
  selector: z.string(),
  var: z.string(),
});

// Captura la URL actual de la página en una variable (para IDs dinámicos).
// Con `replace` aplica un regex a la URL para derivar otra (ej: editor → PDF API).
const readUrlActionSchema = z.object({
  type: z.literal('read-url'),
  var: z.string(),
  replace: z.object({ pattern: z.string(), replacement: z.string() }).optional(),
});

const scrollActionSchema = z.object({
  type: z.literal('scroll'),
  distance: z.number(),
  selector: z.string().optional(),
  behavior: z.enum(['smooth', 'instant']).default('smooth'),
});

const scrollToActionSchema = z.object({
  type: z.literal('scroll-to'),
  selector: z.string(),
});

const hoverActionSchema = z.object({
  type: z.literal('hover'),
  selector: z.string(),
  count: z.number().int().positive().default(1),
  pause_ms: z.number().int().nonnegative().default(400),
});

const waitActionSchema = z.object({
  type: z.literal('wait'),
  selector: z.string().optional(),
  ms: z.number().int().positive().optional(),
  timeout_ms: z.number().int().positive().default(10000),
  optional: z.boolean().default(false),
});

const waitUrlActionSchema = z.object({
  type: z.literal('wait-url'),
  pattern: z.string(),
  timeout_ms: z.number().int().positive().default(15000),
});

const selectComboboxActionSchema = z.object({
  type: z.literal('select-combobox'),
  selector: z.string(),
  option: z.string(),
  index: z.number().int().nonnegative().default(0),
});

const pressKeyActionSchema = z.object({
  type: z.literal('press-key'),
  key: z.string(),
});

const sleepActionSchema = z.object({
  type: z.literal('sleep'),
  ms: z.number().int().positive(),
});

// Draws a handwritten-looking stroke on a <canvas> (signature pads).
const drawActionSchema = z.object({
  type: z.literal('draw'),
  selector: z.string(),
  // Optional normalized path points (0..1 within the canvas box). If omitted,
  // a default signature-like squiggle is drawn.
  points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  step_ms: z.number().int().nonnegative().default(60),
});

// Sets files on an <input type="file"> (works even if the input is hidden).
const uploadFileActionSchema = z.object({
  type: z.literal('upload-file'),
  selector: z.string(),
  // Path to the file, relative to the repo root (or absolute).
  file: z.string(),
});

export const declarativeActionSchema = z.discriminatedUnion('type', [
  navigateActionSchema,
  clickActionSchema,
  fillActionSchema,
  typeActionSchema,
  scrollActionSchema,
  scrollToActionSchema,
  hoverActionSchema,
  waitActionSchema,
  waitUrlActionSchema,
  selectComboboxActionSchema,
  pressKeyActionSchema,
  sleepActionSchema,
  drawActionSchema,
  readValueActionSchema,
  readTextActionSchema,
  readUrlActionSchema,
  uploadFileActionSchema,
]);

export type DeclarativeAction = z.infer<typeof declarativeActionSchema>;

// ── Demo Segment Schema ─────────────────────────────────────────────
export const segmentSchema = z.object({
  id: z.string(),
  action: z.string().optional(),
  actions: z.array(declarativeActionSchema).optional(),
  narration_hint: z.string(),
  pause_after_ms: z.number().int().positive().default(DEFAULT_PAUSE_MS),
  highlight_elements: z.array(z.string()).optional(),
  hidden: z.boolean().default(false),
}).refine(
  (s) => (s.action != null) !== (s.actions != null),
  { message: 'Segment must have exactly one of "action" or "actions"' },
);

export const demoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  duration_target_seconds: z.number().int().positive(),
  locale: z.string().default('es'),
  video_width: z.number().int().positive().optional(),
  video_height: z.number().int().positive().optional(),
  viewport_width: z.number().int().positive().optional(),
  viewport_height: z.number().int().positive().optional(),
  // Override the env TTS_PROVIDER for this demo (e.g. use OpenAI voices
  // while the global default is the cloned ElevenLabs voice).
  tts_provider: z.enum(['openai', 'elevenlabs']).optional(),
  tts_voice: z.string().optional(),
  // ElevenLabs voice ID override for this demo (defaults to ELEVENLABS_VOICE_ID)
  tts_voice_id: z.string().optional(),
  tts_speed: z.number().min(0.25).max(4.0).optional(),
  // ElevenLabs voice_settings por demo (default: 0.5 / 0.0 / 0.85 — el perfil
  // plano histórico). Perfil expresivo de referencia: expr2 = 0.18 / 0.55 / 0.9.
  tts_stability: z.number().min(0).max(1).optional(),
  tts_style: z.number().min(0).max(1).optional(),
  tts_similarity: z.number().min(0).max(1).optional(),
  tts_instructions: z.string().optional(),
  // Per-demo ElevenLabs model override (default: env ELEVENLABS_MODEL =
  // eleven_multilingual_v2). Lets one piece opt into a different model without
  // changing the global env (which would affect every other piece).
  tts_model: z.string().optional(),
  // What the LLM is told it is narrating. Keeps the script in the right voice
  // for your product/domain. Default: a neutral software-demo narrator.
  // (e.g. "a calm product tutorial narrator for a project-management app")
  narration_persona: z.string().optional(),
  // Human-readable language the narration must be written in (e.g. "Spanish
  // (River Plate, voseo)", "English (US)"). Defaults to the demo's `locale`.
  narration_language: z.string().optional(),
  narration_wpm: z.number().int().positive().optional(),
  // Use narration_hint verbatim as the script (no LLM, no padding/rewriting).
  verbatim_narration: z.boolean().optional(),
  // Show an animated guide-cursor + highlight ring before each click/type
  // (for step-by-step tutorials). Fast-paced reels usually leave this false.
  cursor_guide: z.boolean().optional(),
  // No app to log into: skip the login step against BASE_URL and navigate
  // straight to the pages (e.g. a public site, or static HTML you serve).
  skip_login: z.boolean().optional(),
  // Apps whose routes carry no locale prefix (e.g. /dashboard instead of
  // /en/dashboard): navigate uses BASE_URL + path directly.
  no_locale_prefix: z.boolean().optional(),
  // Omit the branded intro/outro slides (logo/gradient) in render and clips.
  // For neutral pieces whose own screens already carry the message.
  skip_branding: z.boolean().optional(),
  // Per-demo branding override (intro/outro/brand_name). If omitted, the render
  // uses the global branding from demos.yaml (orchestrator: demo.branding ?? global).
  branding: brandingSchema.optional(),
  segments: z.array(segmentSchema),
  clips: clipConfigSchema.optional(),
});

export const demosConfigSchema = z.object({
  demos: z.array(demoSchema),
  branding: brandingSchema.optional(),
});

export type Segment = z.infer<typeof segmentSchema>;
export type DemoConfig = z.infer<typeof demoSchema>;
export type DemosConfig = z.infer<typeof demosConfigSchema>;

// ── Timing Marker ───────────────────────────────────────────────────
export interface TimingMarker {
  segmentId: string;
  startMs: number;
  endMs: number;
}

// ── Pipeline Options ────────────────────────────────────────────────
export interface PipelineOptions {
  demoId?: string;
  dryRun: boolean;
  skipSeed: boolean;
  skipRecord: boolean;
  skipScript: boolean;
  skipVoice: boolean;
  skipRender: boolean;
  skipClips: boolean;
}
