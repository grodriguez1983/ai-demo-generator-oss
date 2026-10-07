import { writeFile, readFile } from 'node:fs/promises';
import { getOpenAIClient } from '../utils/openai-client.js';
import { createLogger } from '../utils/logger.js';
import { getOutputPath, fileExists } from '../utils/file-utils.js';
import { SCRIPTS_DIR, NARRATION_WPM } from '../config/constants.js';
import type { DemoConfig, TimingMarker } from '../config/constants.js';

const log = createLogger('script');

/** Generated narration for a single segment */
export interface NarrationSegment {
  segmentId: string;
  text: string;
  startMs: number;
  endMs: number;
  estimatedDurationMs: number;
}

/** Full narration script for a demo */
export interface NarrationScript {
  demoId: string;
  title: string;
  segments: NarrationSegment[];
  loginOffsetMs?: number;
}

/** Generate narration script using OpenAI */
export async function generateScript(
  demo: DemoConfig,
  timingMarkers: TimingMarker[],
  loginOffsetMs?: number,
): Promise<NarrationScript> {
  log.stage(`Generating Script: ${demo.title}`);

  const openai = getOpenAIClient();
  const segments: NarrationSegment[] = [];

  // Build set of hidden segment IDs
  const hiddenIds = new Set(demo.segments.filter((s) => s.hidden).map((s) => s.id));

  for (const marker of timingMarkers) {
    // Skip hidden segments
    if (hiddenIds.has(marker.segmentId)) {
      log.info(`Skipping hidden segment: ${marker.segmentId}`);
      continue;
    }

    const demoSegment = demo.segments.find((s) => s.id === marker.segmentId);
    if (!demoSegment) {
      log.warn(`No segment config for marker: ${marker.segmentId}`);
      continue;
    }

    const durationSec = (marker.endMs - marker.startMs) / 1000;

    // Verbatim mode: use the narration_hint exactly as written, no LLM. For
    // pieces where the hint IS the final script (no rewriting, no padding).
    // Timing markers still come from the recording.
    if (demo.verbatim_narration) {
      const text = demoSegment.narration_hint.trim();
      log.info(`Segment "${marker.segmentId}": verbatim (${text.split(/\s+/).length} words)`);
      segments.push({
        segmentId: marker.segmentId,
        text,
        startMs: marker.startMs,
        endMs: marker.endMs,
        estimatedDurationMs: estimateDuration(text),
      });
      continue;
    }

    const wpm = demo.narration_wpm ?? NARRATION_WPM;
    const targetWords = Math.max(3, Math.round((durationSec / 60) * wpm));

    log.info(`Segment "${marker.segmentId}": ${durationSec.toFixed(1)}s → ~${targetWords} words`);

    const persona = demo.narration_persona ?? 'a professional narrator for a software product demo';
    const language = demo.narration_language ?? demo.locale;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are ${persona}.
Write the narration in this language: ${language}.
Preserve the dialect, grammatical person and style of the narration hint
(e.g. if the hint uses an informal regional voice, keep it): do NOT neutralize it.
The text must be clear, professional and concise, with no unnecessary jargon.
It will be turned into audio, so it must sound natural read aloud.
Do NOT include timestamps, labels or any special formatting.`,
        },
        {
          role: 'user',
          content: `Adapt the narration hint to ~${targetWords} words (±5) for this demo segment.

RULES:
- Your only source is the HINT: condense it by trimming the least important parts, WITHOUT losing its specific content.
- Do NOT invent generic marketing phrases, do NOT repeat the demo title, do NOT summarize the whole demo.
- If the hint already fits the target length, use it almost verbatim.

Demo context (reference only, do NOT narrate it): ${demo.title} - ${demo.description}
Narration hint: ${demoSegment.narration_hint}
Segment duration: ${durationSec.toFixed(1)} seconds

Respond with ONLY the narration text, no quotes or extra formatting.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const text = response.choices[0]?.message?.content?.trim() ?? '';

    segments.push({
      segmentId: marker.segmentId,
      text,
      startMs: marker.startMs,
      endMs: marker.endMs,
      estimatedDurationMs: estimateDuration(text),
    });
  }

  const script: NarrationScript = {
    demoId: demo.id,
    title: demo.title,
    segments,
    loginOffsetMs,
  };

  // Save script to file
  const scriptPath = getOutputPath(SCRIPTS_DIR, demo.id, '.json');
  await writeFile(scriptPath, JSON.stringify(script, null, 2));
  log.info(`Script saved: ${scriptPath}`);

  return script;
}

/** Load a previously generated script */
export async function loadScript(demoId: string): Promise<NarrationScript | null> {
  const scriptPath = getOutputPath(SCRIPTS_DIR, demoId, '.json');
  if (!(await fileExists(scriptPath))) return null;

  const content = await readFile(scriptPath, 'utf-8');
  return JSON.parse(content) as NarrationScript;
}

function estimateDuration(text: string): number {
  const wordCount = text.split(/\s+/).length;
  return Math.ceil((wordCount / NARRATION_WPM) * 60 * 1000);
}
