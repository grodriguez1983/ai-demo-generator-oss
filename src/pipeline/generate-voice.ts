import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { getOpenAIClient } from '../utils/openai-client.js';
import { createLogger } from '../utils/logger.js';
import { getOutputPath } from '../utils/file-utils.js';
import { AUDIO_DIR } from '../config/constants.js';
import type { EnvConfig, DemoConfig } from '../config/constants.js';
import type { NarrationScript } from './generate-script.js';

const log = createLogger('voice');

/** Audio file info for a segment */
export interface AudioSegment {
  segmentId: string;
  filePath: string;
  delayMs: number;
}

/** Generate a single TTS audio file. Reusable by other pipeline stages. */
export async function generateTTSAudio(
  text: string,
  outputPath: string,
  config: EnvConfig,
  demo?: DemoConfig,
): Promise<void> {
  const provider = demo?.tts_provider ?? config.TTS_PROVIDER;
  if (provider === 'elevenlabs') {
    await generateElevenLabsAudio(text, outputPath, config, demo);
    return;
  }

  const openai = getOpenAIClient();
  const voice = (demo?.tts_voice ?? config.TTS_VOICE) as string;
  const instructions = demo?.tts_instructions;

  const speed = demo?.tts_speed ?? 1.0;

  const ttsParams = {
    model: config.TTS_MODEL,
    voice,
    input: text,
    response_format: 'mp3' as const,
    speed,
    ...(instructions ? { instructions } : {}),
  };

  const response = await openai.audio.speech.create(ttsParams);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);

  log.info(`TTS audio saved: ${outputPath} (${(buffer.length / 1024).toFixed(0)}KB)`);
}

/**
 * Generate audio with ElevenLabs via the TTS REST API.
 * Requires ELEVENLABS_API_KEY; the voice id comes from the demo or the env
 * (ELEVENLABS_VOICE_ID, which has a premade default).
 */
async function generateElevenLabsAudio(
  text: string,
  outputPath: string,
  config: EnvConfig,
  demo?: DemoConfig,
): Promise<void> {
  const apiKey = config.ELEVENLABS_API_KEY;
  const voiceId = demo?.tts_voice_id ?? config.ELEVENLABS_VOICE_ID;
  if (!apiKey) throw new Error('TTS_PROVIDER=elevenlabs but ELEVENLABS_API_KEY is missing');
  if (!voiceId) throw new Error('TTS_PROVIDER=elevenlabs but no voice id (set ELEVENLABS_VOICE_ID or the demo tts_voice_id)');

  // Speed is controlled via voice_settings.speed (0.7–1.2). Reuse tts_speed.
  const speed = Math.min(1.2, Math.max(0.7, demo?.tts_speed ?? 1.0));

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: demo?.tts_model ?? config.ELEVENLABS_MODEL,
        voice_settings: {
          stability: demo?.tts_stability ?? 0.5,
          similarity_boost: demo?.tts_similarity ?? 0.85,
          style: demo?.tts_style ?? 0.0,
          use_speaker_boost: true,
          speed,
        },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(outputPath, buffer);
  log.info(`TTS (ElevenLabs) saved: ${outputPath} (${(buffer.length / 1024).toFixed(0)}KB)`);
}

/** Build a fallback timing map from the demo YAML.
 *
 * The actual render must stay aligned to the recorded visual timeline, so this
 * map is only a fallback when the script has no trustworthy timings or was
 * generated before the current calibration. Using it as the primary source for
 * every render causes the narration to drift away from the image changes.
 */
export function buildDemoTimingMap(demo?: DemoConfig): Map<string, number> {
  const map = new Map<string, number>();
  if (!demo) return map;

  let cursorMs = 0;
  for (const segment of demo.segments) {
    const sleepMs = segment.actions?.reduce((acc, action) => {
      if (action.type === 'sleep') return Math.max(acc, action.ms);
      return acc;
    }, 0) ?? 0;

    map.set(segment.id, cursorMs);
    cursorMs += sleepMs;
  }

  return map;
}

/** Generate TTS audio for all segments in a script */
export async function generateVoice(
  config: EnvConfig,
  script: NarrationScript,
  demo?: DemoConfig,
): Promise<AudioSegment[]> {
  log.stage(`Generating Voice: ${script.title}`);

  const audioSegments: AudioSegment[] = [];
  const voice = (demo?.tts_voice ?? config.TTS_VOICE) as string;
  const instructions = demo?.tts_instructions;
  const demoTimingMap = buildDemoTimingMap(demo);

  if (instructions) {
    log.info(`TTS instructions: "${instructions.slice(0, 80)}..."`);
  }
  log.info(`TTS voice: ${voice}`);

  for (const segment of script.segments) {
    if (!segment.text.trim()) {
      log.warn(`Empty text for segment: ${segment.segmentId}, skipping`);
      continue;
    }

    log.info(`TTS for "${segment.segmentId}": "${segment.text.slice(0, 60)}..."`);

    const audioPath = getOutputPath(
      AUDIO_DIR,
      `${script.demoId}-${segment.segmentId}`,
      '.mp3',
    );
    // Source of truth for sync is the actual registered timing of the rendered
    // visual timeline. The demo YAML is only used as fallback when the script
    // lacks valid startMs values.
    const delayMs = Number.isFinite(segment.startMs) ? segment.startMs : (demoTimingMap.get(segment.segmentId) ?? 0);

    // Incremental TTS: with TTS_SKIP_EXISTING=1, reuse an already-rendered mp3 and only
    // synthesize segments whose audio is missing (delete an mp3 to force its regeneration).
    if (process.env.TTS_SKIP_EXISTING === '1' && existsSync(audioPath)) {
      log.info(`Reusing existing audio for "${segment.segmentId}" (TTS_SKIP_EXISTING)`);
      audioSegments.push({
        segmentId: segment.segmentId,
        filePath: audioPath,
        delayMs,
      });
      continue;
    }

    await generateTTSAudio(segment.text, audioPath, config, demo);

    audioSegments.push({
      segmentId: segment.segmentId,
      filePath: audioPath,
      delayMs,
    });
  }

  return audioSegments;
}
