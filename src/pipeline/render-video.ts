import { createLogger } from '../utils/logger.js';
import { getOutputPath, fileExists } from '../utils/file-utils.js';
import { VIDEOS_DIR, FINAL_DIR } from '../config/constants.js';
import type { EnvConfig, DemoConfig, TimingMarker, Branding } from '../config/constants.js';
import {
  webmToMp4,
  mergeVideoAudio,
  videoToGif,
  getVideoDuration,
  trimVideo,
  concatenateClips,
} from '../utils/ffmpeg.js';
import { generateBrandedSlide } from '../utils/html-slide.js';
import type { AudioSegment } from './generate-voice.js';
import { rm, copyFile, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const log = createLogger('render');

export interface RenderOptions {
  loginOffsetMs?: number;
  timingMarkers?: TimingMarker[];
  branding?: Branding;
}

/** Render final video: webm → mp4 (with optional upscale), trim, merge audio, intro/outro, GIF */
export async function renderVideo(
  config: EnvConfig,
  demoId: string,
  audioSegments: AudioSegment[],
  demo?: DemoConfig,
  options?: RenderOptions,
): Promise<{ mp4Path: string; gifPath: string; contentMp4Path: string }> {
  log.stage(`Rendering: ${demoId}`);

  const webmPath = getOutputPath(VIDEOS_DIR, demoId, '.webm');
  const tempMp4Path = getOutputPath(VIDEOS_DIR, demoId, '-temp.mp4');
  const contentMp4Path = getOutputPath(VIDEOS_DIR, demoId, '-content.mp4');
  const finalMp4Path = getOutputPath(FINAL_DIR, demoId, '.mp4');
  const gifPath = getOutputPath(FINAL_DIR, demoId, '.gif');
  const tempDir = getOutputPath(VIDEOS_DIR, `${demoId}-render-temp`, '');
  await mkdir(tempDir, { recursive: true });

  // Step 1: Convert webm to mp4 (upscale, no audio)
  if (!(await fileExists(webmPath))) {
    throw new Error(`Video not found: ${webmPath}. Run recording first.`);
  }
  const targetWidth = demo?.video_width;
  const targetHeight = demo?.video_height;
  await webmToMp4(webmPath, tempMp4Path, targetWidth, targetHeight);

  const duration = await getVideoDuration(tempMp4Path);
  log.info(`Video duration: ${duration.toFixed(1)}s`);

  const loginOffsetMs = options?.loginOffsetMs ?? 0;
  const markers = options?.timingMarkers ?? [];
  const branding = options?.branding;
  // Con skip_login el offset es 0, pero si hay segmentos hidden igual hay que
  // recortarlos del video final (bug: antes exigía loginOffsetMs > 0).
  const hasHiddenSegments = demo?.segments.some((s) => s.hidden) ?? false;
  const hasTrimmingData = markers.length > 0 && (loginOffsetMs > 0 || hasHiddenSegments);

  let trimmedVideoPath: string;

  if (hasTrimmingData && demo) {
    // Step 2: Calculate visible ranges and trim
    const trimmedPath = join(tempDir, `${demoId}-trimmed.mp4`);
    trimmedVideoPath = await trimToContentVideo(
      tempMp4Path, trimmedPath, tempDir, loginOffsetMs, markers, demo,
    );
  } else {
    // No trimming data — use the full mp4
    log.info('No trimming data available, using full video as content');
    trimmedVideoPath = tempMp4Path;
  }

  // Step 3: Adjust audio delays for trimmed video and merge → contentMp4Path
  // contentMp4Path is the "content" video (trimmed + audio) used by clips stage
  if (audioSegments.length > 0) {
    let adjustedAudio: AudioSegment[];
    if (hasTrimmingData && demo) {
      // Trimming removed login/hidden ranges — remap audio to the new timeline.
      adjustedAudio = adjustAudioDelays(audioSegments, markers, demo);
    } else if (markers.length > 0) {
      // No trimming but we have the actual recording timestamps.
      // Each marker.startMs is exactly when that screen appeared in the webm.
      // Use it directly as the audio delay so narration locks to its screen.
      // Without this, the script's computed startMs values drift by ~1s/segment
      // because Playwright navigation overhead (~1s) is not in the audio math.
      adjustedAudio = syncAudioToMarkers(audioSegments, markers);
      log.info('Audio synced to actual recording timestamps (no trimming needed)');
    } else {
      adjustedAudio = audioSegments;
    }
    await mergeVideoAudio(trimmedVideoPath, adjustedAudio, contentMp4Path);
  } else {
    log.warn('No audio segments, using video without narration');
    await copyFile(trimmedVideoPath, contentMp4Path);
  }

  log.info(`Content video: ${contentMp4Path}`);

  // Step 4: Add intro/outro if branding is available
  if (branding && demo) {
    const vw = demo.video_width ?? config.VIDEO_WIDTH;
    const vh = demo.video_height ?? config.VIDEO_HEIGHT;

    const brand = {
      ...branding,
      intro_text: branding.intro_text ?? 'My Product',
      outro_text: branding.outro_text ?? 'Request a demo',
      intro_duration_sec: branding.intro_duration_sec ?? 2.5,
      outro_duration_sec: branding.outro_duration_sec ?? 3,
    };

    let logoSvg: string | undefined;
    if (brand.logo_path) {
      try {
        logoSvg = await readFile(join(process.cwd(), brand.logo_path), 'utf-8');
      } catch {
        /* logo opcional — si no se puede leer, cae al escudo default */
      }
    }

    const introPath = join(tempDir, `${demoId}-intro.mp4`);
    await generateBrandedSlide(introPath, {
      width: vw,
      height: vh,
      durationSec: brand.intro_duration_sec,
      brandName: brand.brand_name,
      logoSvg,
      bgGradient: brand.bg_gradient,
      title: brand.intro_text,
      description: demo.title,
    });

    const outroPath = join(tempDir, `${demoId}-outro.mp4`);
    await generateBrandedSlide(outroPath, {
      width: vw,
      height: vh,
      durationSec: brand.outro_duration_sec,
      brandName: brand.brand_name,
      logoSvg,
      bgGradient: brand.bg_gradient,
      title: brand.outro_text,
      description: brand.outro_url,
    });

    await concatenateClips([introPath, contentMp4Path, outroPath], finalMp4Path);
    log.info(`Final MP4 (with intro/outro): ${finalMp4Path}`);
  } else {
    // No branding — content video IS the final video
    await copyFile(contentMp4Path, finalMp4Path);
    log.info(`Final MP4: ${finalMp4Path}`);
  }

  // Step 5: Generate GIF
  await videoToGif(finalMp4Path, gifPath, config.GIF_FPS, config.GIF_WIDTH);
  log.info(`GIF: ${gifPath}`);

  // Cleanup temp files
  await rm(tempMp4Path, { force: true });
  await rm(tempDir, { recursive: true, force: true });

  return { mp4Path: finalMp4Path, gifPath, contentMp4Path };
}

/**
 * Trim the full recording to only visible segments (removing login + hidden segments).
 * Returns the path to the trimmed content video.
 */
async function trimToContentVideo(
  sourceMp4: string,
  outputPath: string,
  tempDir: string,
  loginOffsetMs: number,
  markers: TimingMarker[],
  demo: DemoConfig,
): Promise<string> {
  const hiddenIds = new Set(demo.segments.filter((s) => s.hidden).map((s) => s.id));

  // Build visible ranges: each marker's position in the video is loginOffsetMs + marker.startMs
  const visibleRanges: { startMs: number; endMs: number }[] = [];
  for (const marker of markers) {
    if (hiddenIds.has(marker.segmentId)) {
      log.info(`Trimming hidden segment: ${marker.segmentId} (${((marker.endMs - marker.startMs) / 1000).toFixed(1)}s)`);
      continue;
    }
    const videoStartMs = loginOffsetMs + marker.startMs;
    const videoEndMs = loginOffsetMs + marker.endMs;
    visibleRanges.push({ startMs: videoStartMs, endMs: videoEndMs });
  }

  if (visibleRanges.length === 0) {
    log.warn('No visible ranges found, using full video');
    const fsp = await import('node:fs/promises');
    await fsp.copyFile(sourceMp4, outputPath);
    return outputPath;
  }

  // Merge contiguous ranges (ranges that are adjacent)
  const mergedRanges: { startMs: number; endMs: number }[] = [];
  for (const range of visibleRanges) {
    const last = mergedRanges[mergedRanges.length - 1];
    if (last && Math.abs(range.startMs - last.endMs) < 100) {
      // Contiguous — extend the previous range
      last.endMs = range.endMs;
    } else {
      mergedRanges.push({ ...range });
    }
  }

  log.info(`Visible ranges: ${mergedRanges.length} (from ${visibleRanges.length} segments)`);
  for (const range of mergedRanges) {
    log.info(`  ${(range.startMs / 1000).toFixed(1)}s – ${(range.endMs / 1000).toFixed(1)}s`);
  }

  if (mergedRanges.length === 1) {
    // Single range — just trim
    await trimVideo(sourceMp4, outputPath, mergedRanges[0].startMs, mergedRanges[0].endMs);
    return outputPath;
  }

  // Multiple ranges — trim each and concatenate using concat demuxer (video-only safe)
  const trimmedParts: string[] = [];
  for (let i = 0; i < mergedRanges.length; i++) {
    const partPath = join(tempDir, `part-${i}.mp4`);
    await trimVideo(sourceMp4, partPath, mergedRanges[i].startMs, mergedRanges[i].endMs);
    trimmedParts.push(partPath);
  }

  // Use concat demuxer (file list) — works for video-only files unlike filter_complex concat
  const listPath = join(tempDir, 'concat-list.txt');
  const listContent = trimmedParts.map((p) => `file '${p}'`).join('\n');
  await writeFile(listPath, listContent);

  log.info(`Concatenating ${trimmedParts.length} parts via demuxer → ${outputPath}`);
  await execFileAsync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    outputPath,
  ], { maxBuffer: 50 * 1024 * 1024 });

  return outputPath;
}

/**
 * Sync each audio segment to the actual timestamp its screen appeared in the
 * recording.  marker.startMs is the wall-clock offset (relative to recording
 * start) of that segment — exactly the moment the screen changed.  Using this
 * eliminates the ~1s/segment Playwright navigation drift that accumulates when
 * audio delays are computed from theoretical sleep values instead.
 */
function syncAudioToMarkers(
  audioSegments: AudioSegment[],
  markers: TimingMarker[],
): AudioSegment[] {
  const markerMap = new Map(markers.map((m) => [m.segmentId, m.startMs]));
  return audioSegments.map((seg) => {
    const startMs = markerMap.get(seg.segmentId);
    return startMs !== undefined ? { ...seg, delayMs: startMs } : seg;
  });
}

/**
 * Adjust audio segment delays for the trimmed content video.
 * After trimming, the audio needs to be repositioned relative to the content-only timeline.
 */
function adjustAudioDelays(
  audioSegments: AudioSegment[],
  markers: TimingMarker[],
  demo: DemoConfig,
): AudioSegment[] {
  const hiddenIds = new Set(demo.segments.filter((s) => s.hidden).map((s) => s.id));

  // El content video es la concatenación de las ventanas visibles: la posición
  // de cada segmento es la suma de las duraciones visibles anteriores. Esto
  // soporta ventanas recortadas (sub-rangos con huecos arbitrarios), no solo
  // huecos causados por segmentos hidden.
  const sortedMarkers = [...markers].sort((a, b) => a.startMs - b.startMs);
  let cursorMs = 0;
  const adjustments = new Map<string, number>(); // segmentId → adjusted startMs

  for (const marker of sortedMarkers) {
    if (hiddenIds.has(marker.segmentId)) continue;
    adjustments.set(marker.segmentId, cursorMs);
    cursorMs += marker.endMs - marker.startMs;
  }

  return audioSegments.map((seg) => {
    const adjustedDelay = adjustments.get(seg.segmentId);
    if (adjustedDelay !== undefined) {
      return { ...seg, delayMs: adjustedDelay };
    }
    return seg;
  });
}
