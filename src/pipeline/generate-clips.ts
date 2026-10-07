import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '../utils/logger.js';
import { resolvePath, fileExists, getOutputPath } from '../utils/file-utils.js';
import {
  CLIPS_DIR,
  SUBTITLES_DIR,
  FINAL_DIR,
  VIDEOS_DIR,
  AUDIO_DIR,
  SOCIAL_PLATFORMS,
} from '../config/constants.js';
import type {
  DemoConfig,
  EnvConfig,
  Branding,
  HighlightClip,
  PlatformSpec,
} from '../config/constants.js';
import { loadScript } from './generate-script.js';
import type { NarrationScript, NarrationSegment } from './generate-script.js';
import { generateTTSAudio } from './generate-voice.js';
import { generateSrt, generateHighlightSrt } from '../utils/srt.js';
import {
  trimVideo,
  adaptToAspectRatio,
  addSubtitles,
  addLogoOverlay,
  generateSlide,
  concatenateClips,
} from '../utils/ffmpeg.js';
import type { SubtitleEntry } from '../utils/ffmpeg.js';
import { generateBrandedSlide, generatePainHookSlide } from '../utils/html-slide.js';

const log = createLogger('clips');

/** Generate social clips for a demo */
export async function generateClips(
  demo: DemoConfig,
  config: EnvConfig,
  branding?: Branding,
): Promise<void> {
  const clipConfig = demo.clips;
  if (!clipConfig) {
    log.info(`No clip config for ${demo.id}, skipping`);
    return;
  }

  log.stage(`Stage 6: Social Clips — ${demo.id}`);

  // Load narration script for subtitles
  let script = await loadScript(demo.id);
  if (!script) {
    log.warn(`No narration script for ${demo.id}, clips will have no subtitles`);
  } else {
    // Adjust script timing for content video (hidden segments removed)
    script = adjustScriptForContentVideo(script, demo);
  }

  // Prefer content video (without login/hidden) over final video (with intro/outro)
  const contentMp4 = resolvePath(VIDEOS_DIR, `${demo.id}-content.mp4`);
  const finalMp4 = resolvePath(FINAL_DIR, `${demo.id}.mp4`);
  const sourceMp4 = (await fileExists(contentMp4)) ? contentMp4 : finalMp4;
  if (!(await fileExists(sourceMp4))) {
    log.error(`Source video not found: ${sourceMp4}. Run render stage first.`);
    return;
  }
  if (sourceMp4 === contentMp4) {
    log.info(`Using content video (no login/hidden): ${contentMp4}`);
  }

  // Create output dirs
  const clipOutputDir = resolvePath(CLIPS_DIR, demo.id);
  const tempDir = join(clipOutputDir, '.temp');
  const subtitleDir = resolvePath(SUBTITLES_DIR, demo.id);
  await mkdir(clipOutputDir, { recursive: true });
  await mkdir(tempDir, { recursive: true });
  await mkdir(subtitleDir, { recursive: true });

  // Resolve branding defaults
  const brand: Branding = {
    primary_color: '#1E40AF',
    secondary_color: '#FFFFFF',
    intro_text: 'My Product',
    outro_text: 'Request a demo',
    font: 'Arial',
    intro_duration_sec: 2.5,
    outro_duration_sec: 3,
    ...branding,
  };

  // Reels neutrales (skip_branding) no llevan logo overlay corporativo.
  const logoPath = !demo.skip_branding && brand.logo_path ? resolvePath(brand.logo_path) : undefined;
  const hasLogo = logoPath ? await fileExists(logoPath) : false;
  if (logoPath && !hasLogo) {
    log.warn(`Logo not found at ${logoPath}, proceeding without logo`);
  }
  const effectiveLogoPath = hasLogo ? logoPath : undefined;

  // Generate full demo clips
  if (clipConfig.generate_full !== false) {
    for (const platformName of clipConfig.platforms) {
      const platform = SOCIAL_PLATFORMS[platformName];
      if (!platform) {
        log.warn(`Unknown platform: ${platformName}, skipping`);
        continue;
      }
      await generateFullClip(
        demo, config, sourceMp4, script, platform, platformName,
        brand, effectiveLogoPath, clipOutputDir, tempDir, subtitleDir,
      );
    }
  }

  // Generate highlight clips
  for (const highlight of clipConfig.highlights) {
    const platforms = highlight.platforms ?? clipConfig.platforms;
    for (const platformName of platforms) {
      const platform = SOCIAL_PLATFORMS[platformName];
      if (!platform) {
        log.warn(`Unknown platform: ${platformName}, skipping`);
        continue;
      }
      await generateHighlightClipVideo(
        demo, config, sourceMp4, script, highlight, platform, platformName,
        brand, effectiveLogoPath, clipOutputDir, tempDir, subtitleDir,
      );
    }
  }

  // Cleanup temp directory
  await rm(tempDir, { recursive: true, force: true });
  log.info(`Cleaned up temp dir for ${demo.id}`);
  log.stage(`Clips complete for ${demo.id}`);
}

/** Determine aspect ratio adaptation mode */
function getAdaptMode(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): 'blur-background' | 'crop' | 'none' {
  const sourceAR = sourceWidth / sourceHeight;
  const targetAR = targetWidth / targetHeight;
  const ratio = sourceAR / targetAR;

  if (ratio > 0.9 && ratio < 1.1) return 'none';
  if (ratio > 1.5 || ratio < 0.67) return 'blur-background';
  return 'crop';
}

/** Generate a full demo clip for a single platform */
async function generateFullClip(
  demo: DemoConfig,
  config: EnvConfig,
  sourceMp4: string,
  script: NarrationScript | null,
  platform: PlatformSpec,
  platformName: string,
  brand: Branding,
  logoPath: string | undefined,
  outputDir: string,
  tempDir: string,
  subtitleDir: string,
): Promise<void> {
  const tag = `${demo.id}-full-${platformName}`;
  log.info(`Generating full clip: ${tag}`);

  const sourceW = demo.video_width ?? 1280;
  const sourceH = demo.video_height ?? 720;
  const { width: tw, height: th } = platform;

  let currentFile = sourceMp4;

  // Step 1: Adapt aspect ratio if needed
  const adaptMode = getAdaptMode(sourceW, sourceH, tw, th);
  if (adaptMode !== 'none') {
    const adaptedPath = join(tempDir, `${tag}-adapted.mp4`);
    await adaptToAspectRatio(currentFile, adaptedPath, {
      targetWidth: tw,
      targetHeight: th,
      mode: adaptMode,
    });
    currentFile = adaptedPath;
  }

  // Step 2: Add subtitles
  if (script) {
    const srtPath = join(subtitleDir, `${tag}.srt`);
    await generateSrt(script, srtPath);

    const entries = segmentsToSubtitleEntries(script.segments);
    const subbedPath = join(tempDir, `${tag}-subbed.mp4`);
    await addSubtitles(currentFile, entries, subbedPath, {
      fontSize: platform.subtitleFontSize,
      fontName: brand.font,
      marginV: platform.subtitleMarginV,
    });
    currentFile = subbedPath;
  }

  // Step 4: Add logo overlay on demo content
  if (logoPath) {
    const logoedPath = join(tempDir, `${tag}-logo.mp4`);
    await addLogoOverlay(currentFile, logoedPath, logoPath);
    currentFile = logoedPath;
  }

  // Step 5: Generate intro and outro slides (branded HTML) — unless the demo
  // is neutral (skip_branding), in which case its own screens are the reel.
  const finalPath = join(outputDir, `${tag}.mp4`);
  if (demo.skip_branding) {
    await concatenateClips([currentFile], finalPath);
    log.info(`Full clip ready (neutral, no intro/outro): ${finalPath}`);
    return;
  }

  const introPath = join(tempDir, `${tag}-intro.mp4`);
  await generateBrandedSlide(introPath, {
    width: tw,
    height: th,
    durationSec: brand.intro_duration_sec,
    title: brand.intro_text,
    description: demo.title,
  });

  const outroPath = join(tempDir, `${tag}-outro.mp4`);
  await generateBrandedSlide(outroPath, {
    width: tw,
    height: th,
    durationSec: brand.outro_duration_sec,
    title: brand.outro_text,
    description: brand.outro_url,
  });

  // Step 6: Concatenate intro + content + outro
  await concatenateClips([introPath, currentFile, outroPath], finalPath);

  log.info(`Full clip ready: ${finalPath}`);
}

/** Generate a highlight clip for a single platform */
async function generateHighlightClipVideo(
  demo: DemoConfig,
  config: EnvConfig,
  sourceMp4: string,
  script: NarrationScript | null,
  highlight: HighlightClip,
  platform: PlatformSpec,
  platformName: string,
  brand: Branding,
  logoPath: string | undefined,
  outputDir: string,
  tempDir: string,
  subtitleDir: string,
): Promise<void> {
  const tag = `${demo.id}-${highlight.id}-${platformName}`;
  log.info(`Generating highlight clip: ${tag}`);

  if (!script) {
    log.warn(`No script available for highlight ${tag}, skipping`);
    return;
  }

  // Find timing range from segments
  const selectedSegments = script.segments.filter(
    (s) => highlight.segments.includes(s.segmentId),
  );

  if (selectedSegments.length === 0) {
    log.warn(`No matching segments for highlight ${highlight.id}, skipping`);
    return;
  }

  const startMs = Math.min(...selectedSegments.map((s) => s.startMs));
  const endMs = Math.max(...selectedSegments.map((s) => s.endMs));

  if (platform.maxDurationSec) {
    const clipDurationSec = (endMs - startMs) / 1000;
    if (clipDurationSec > platform.maxDurationSec) {
      log.warn(
        `Highlight ${tag} is ${clipDurationSec.toFixed(1)}s but ${platformName} max is ${platform.maxDurationSec}s. Trimming to fit.`,
      );
    }
  }

  const sourceW = demo.video_width ?? 1280;
  const sourceH = demo.video_height ?? 720;
  const { width: tw, height: th } = platform;

  // Step 1: Trim source video to highlight range
  const trimmedPath = join(tempDir, `${tag}-trimmed.mp4`);
  const effectiveEndMs = platform.maxDurationSec
    ? Math.min(endMs, startMs + platform.maxDurationSec * 1000)
    : endMs;
  await trimVideo(sourceMp4, trimmedPath, startMs, effectiveEndMs);
  let currentFile = trimmedPath;

  // Step 2: Adapt aspect ratio
  const adaptMode = getAdaptMode(sourceW, sourceH, tw, th);
  if (adaptMode !== 'none') {
    const adaptedPath = join(tempDir, `${tag}-adapted.mp4`);
    await adaptToAspectRatio(currentFile, adaptedPath, {
      targetWidth: tw,
      targetHeight: th,
      mode: adaptMode,
    });
    currentFile = adaptedPath;
  }

  // Step 3: Add subtitles (rebased timing)
  const srtPath = join(subtitleDir, `${tag}.srt`);
  await generateHighlightSrt(script, highlight.segments, srtPath);

  const entries = segmentsToSubtitleEntries(selectedSegments, startMs);
  const subbedPath = join(tempDir, `${tag}-subbed.mp4`);
  await addSubtitles(currentFile, entries, subbedPath, {
    fontSize: platform.subtitleFontSize,
    fontName: brand.font,
    marginV: platform.subtitleMarginV,
  });
  currentFile = subbedPath;

  // Step 5: Add logo overlay on demo content
  if (logoPath) {
    const logoedPath = join(tempDir, `${tag}-logo.mp4`);
    await addLogoOverlay(currentFile, logoedPath, logoPath);
    currentFile = logoedPath;
  }

  // Step 6: Build clip parts — intro/hook → demo → outro
  const clipParts: string[] = [];

  if (highlight.hook_style === 'pain' && highlight.hook_chat.length > 0) {
    // Unbranded pain hook: WhatsApp-style chat mockup + big pain statement.
    // The viewer identifies with the problem shown; brand appears only at outro.
    let hookAudioPath: string | undefined;
    if (highlight.hook_narration) {
      hookAudioPath = getOutputPath(AUDIO_DIR, `${demo.id}-hook-${highlight.id}`, '.mp3');
      await generateTTSAudio(highlight.hook_narration, hookAudioPath, config, demo);
    }

    const hookPath = join(tempDir, `${tag}-hook-pain.mp4`);
    await generatePainHookSlide(hookPath, {
      width: tw,
      height: th,
      durationSec: highlight.hook_duration_sec ?? 4,
      overlayText: highlight.hook_title ?? highlight.label,
      chatTitle: highlight.hook_chat_title,
      messages: highlight.hook_chat,
      audioPath: hookAudioPath,
    });
    clipParts.push(hookPath);
  } else if (highlight.hook_title || highlight.hook_narration) {
    // Branded HTML slide with gradient, logo, title, description, numbered items
    let hookAudioPath: string | undefined;
    if (highlight.hook_narration) {
      hookAudioPath = getOutputPath(AUDIO_DIR, `${demo.id}-hook-${highlight.id}`, '.mp3');
      await generateTTSAudio(highlight.hook_narration, hookAudioPath, config, demo);
    }

    const hookPath = join(tempDir, `${tag}-hook-branded.mp4`);
    await generateBrandedSlide(hookPath, {
      width: tw,
      height: th,
      durationSec: highlight.hook_duration_sec ?? 8,
      eyebrow: highlight.hook_eyebrow,
      title: highlight.hook_title ?? highlight.label,
      description: highlight.hook_description,
      items: highlight.hook_lines,
      audioPath: hookAudioPath,
    });
    clipParts.push(hookPath);
  } else if (highlight.hook_lines.length > 0) {
    // Fallback: individual hook slides (no narration)
    const hookDur = highlight.hook_duration_sec ?? 2;
    for (let i = 0; i < highlight.hook_lines.length; i++) {
      const hookPath = join(tempDir, `${tag}-hook-${i}.mp4`);
      await generateSlide(hookPath, {
        width: tw,
        height: th,
        durationSec: hookDur,
        bgColor: brand.primary_color,
        text: highlight.hook_lines[i],
        textColor: brand.secondary_color,
        fontSize: Math.round(tw * 0.045),
        fontName: brand.font,
        logoPath,
        logoScale: 0.15,
      });
      clipParts.push(hookPath);
    }
  }

  // Demo content
  clipParts.push(currentFile);

  // Outro CTA (branded HTML slide)
  const outroPath = join(tempDir, `${tag}-outro.mp4`);
  await generateBrandedSlide(outroPath, {
    width: tw,
    height: th,
    durationSec: brand.outro_duration_sec,
    title: brand.outro_text,
    description: brand.outro_url,
  });
  clipParts.push(outroPath);

  // Step 7: Concatenate hook → demo → outro
  const finalPath = join(outputDir, `${tag}.mp4`);
  await concatenateClips(clipParts, finalPath);

  log.info(`Highlight clip ready: ${finalPath}`);
}

/**
 * Split subtitle text into short chunks (reels-style) so no line overflows
 * the video width. Breaks on word boundaries, preferring strong punctuation.
 */
function chunkSubtitleText(text: string, maxChars = 34): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
    // Natural break on strong punctuation once the chunk has some body
    if (/[.;:!?]$/.test(word) && current.length >= maxChars * 0.4) {
      chunks.push(current);
      current = '';
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Convert NarrationSegments to SubtitleEntries, optionally rebasing from a
 * start offset. Each segment's text is split into short chunks and its time
 * window distributed proportionally to chunk length (karaoke-style pacing).
 */
function segmentsToSubtitleEntries(
  segments: NarrationSegment[],
  baseMs = 0,
): SubtitleEntry[] {
  const entries: SubtitleEntry[] = [];
  for (const seg of segments) {
    const chunks = chunkSubtitleText(seg.text);
    const windowMs = seg.endMs - seg.startMs;
    const totalChars = chunks.reduce((sum, c) => sum + c.length, 0) || 1;
    let cursorMs = seg.startMs;
    for (const chunk of chunks) {
      const durMs = windowMs * (chunk.length / totalChars);
      entries.push({
        text: chunk,
        startSec: (cursorMs - baseMs) / 1000,
        endSec: (cursorMs + durMs - baseMs) / 1000,
      });
      cursorMs += durMs;
    }
  }
  return entries;
}

/**
 * Adjust script timing for the content video where hidden segments have been removed.
 * Detects gaps in the script timeline (caused by removed hidden segments) and shifts
 * subsequent segment times accordingly.
 */
function adjustScriptForContentVideo(
  script: NarrationScript,
  demo: DemoConfig,
): NarrationScript {
  const hiddenIds = new Set(demo.segments.filter((s) => s.hidden).map((s) => s.id));
  if (hiddenIds.size === 0) return script;

  // El content video es la concatenación de los rangos visibles, en orden.
  // La posición de cada segmento visible es la suma de las duraciones de los
  // visibles anteriores. Esto cubre lo que la versión por-gaps no cubría:
  // tiempo oculto ANTES del primer segmento visible (p.ej. un warmup), y
  // scripts que traen entradas para los segmentos ocultos.
  const sorted = [...script.segments].sort((a, b) => a.startMs - b.startMs);
  const visible = sorted.filter((s) => !hiddenIds.has(s.segmentId));

  let cursorMs = 0;
  const adjusted: NarrationSegment[] = visible.map((seg) => {
    const durMs = seg.endMs - seg.startMs;
    const out = { ...seg, startMs: cursorMs, endMs: cursorMs + durMs };
    cursorMs += durMs;
    return out;
  });

  return { ...script, segments: adjusted };
}
