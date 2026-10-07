import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from './logger.js';
import {
  VIDEO_CODEC,
  VIDEO_PRESET,
  VIDEO_CRF,
  AUDIO_CODEC,
  GIF_LANCZOS_FLAGS,
} from '../config/constants.js';

const execFileAsync = promisify(execFile);
const log = createLogger('ffmpeg');

/** Check if ffmpeg is available */
export async function checkFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

/** Run an ffmpeg command with logging */
async function runFfmpeg(args: string[]): Promise<string> {
  log.debug(`ffmpeg ${args.join(' ')}`);
  try {
    const { stdout, stderr } = await execFileAsync('ffmpeg', args, {
      maxBuffer: 50 * 1024 * 1024,
    });
    return stdout || stderr;
  } catch (error) {
    const err = error as Error & { stderr?: string };
    log.error(`ffmpeg failed: ${err.message}`);
    if (err.stderr) log.debug(err.stderr);
    throw error;
  }
}

/** Convert webm to mp4 (no audio), optionally upscaling to target dimensions */
export async function webmToMp4(
  inputPath: string,
  outputPath: string,
  targetWidth?: number,
  targetHeight?: number,
): Promise<void> {
  const scaleLabel = targetWidth && targetHeight ? ` (→ ${targetWidth}x${targetHeight})` : '';
  log.info(`Converting ${inputPath} → ${outputPath}${scaleLabel}`);

  const args = [
    '-y',
    '-i', inputPath,
    '-c:v', VIDEO_CODEC,
    '-preset', VIDEO_PRESET,
    '-crf', String(VIDEO_CRF),
    '-pix_fmt', 'yuv420p',
  ];

  if (targetWidth && targetHeight) {
    args.push('-vf', `scale=${targetWidth}:${targetHeight}:flags=lanczos`);
  }

  args.push('-an', outputPath);
  await runFfmpeg(args);
}

interface AudioSegment {
  filePath: string;
  delayMs: number;
}

/**
 * Compute the linear gain (dB) that takes a file to -16 LUFS / -1.5 dBTP.
 * Two-pass: measure, then the caller applies `volume=<gain>dB`. Linear gain
 * keeps short clips consistent where one-pass loudnorm behaves dynamically.
 */
export async function linearNormalizationGainDb(filePath: string): Promise<number> {
  const measured = await measureLoudness(filePath);
  if (!measured || !Number.isFinite(measured.inputI)) return 0;
  const gainForLoudness = -16 - measured.inputI;
  const gainCapForPeak = Number.isFinite(measured.inputTp)
    ? -1.5 - measured.inputTp
    : gainForLoudness;
  return Math.min(gainForLoudness, gainCapForPeak);
}

/** Measure integrated loudness (LUFS) and true peak (dBTP) of an audio file */
async function measureLoudness(
  filePath: string,
): Promise<{ inputI: number; inputTp: number } | null> {
  try {
    const output = await execFileAsync('ffmpeg', [
      '-i', filePath,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json',
      '-f', 'null', '-',
    ], { maxBuffer: 50 * 1024 * 1024 }).then((r) => r.stderr || r.stdout);
    const start = output.lastIndexOf('{');
    const end = output.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    const data = JSON.parse(output.slice(start, end + 1)) as { input_i: string; input_tp: string };
    return { inputI: parseFloat(data.input_i), inputTp: parseFloat(data.input_tp) };
  } catch {
    return null;
  }
}

/** Merge video with positioned audio segments */
export async function mergeVideoAudio(
  videoPath: string,
  audioSegments: AudioSegment[],
  outputPath: string,
): Promise<void> {
  if (audioSegments.length === 0) {
    log.warn('No audio segments, copying video as-is');
    await runFfmpeg(['-y', '-i', videoPath, '-c', 'copy', outputPath]);
    return;
  }

  log.info(`Merging video with ${audioSegments.length} audio segments`);

  // Sort by requested start time (= visual screen transition time).
  const sorted = [...audioSegments].sort((a, b) => a.delayMs - b.delayMs);
  const videoDurMs = (await getVideoDuration(videoPath)) * 1000;

  // For each segment, the "visual window" is the time until the next segment
  // starts (or until the video ends for the last segment).  If the TTS audio
  // is longer than its window we speed it up slightly with atempo so it always
  // ends before the next screen appears.  Each narration starts at EXACTLY its
  // delayMs — never pushed back — keeping audio in perfect sync with the image.
  const { mkdtemp, rm: rmDir } = await import('node:fs/promises');
  const { join: pathJoin } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const fitDir = await mkdtemp(pathJoin(tmpdir(), 'audio-fit-'));

  const fittedSegments: Array<{ filePath: string; delayMs: number }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    const windowMs = i + 1 < sorted.length
      ? sorted[i + 1].delayMs - seg.delayMs
      : videoDurMs - seg.delayMs;
    const audioDurMs = (await getVideoDuration(seg.filePath)) * 1000;

    if (windowMs > 500 && audioDurMs > windowMs * 1.01) {
      const factor = audioDurMs / windowMs;
      let atempoChain: string;
      if (factor <= 2.0) {
        atempoChain = `atempo=${factor.toFixed(5)}`;
      } else if (factor <= 4.0) {
        const f = Math.sqrt(factor);
        atempoChain = `atempo=${f.toFixed(5)},atempo=${f.toFixed(5)}`;
      } else {
        atempoChain = `atempo=2.0,atempo=2.0`;
        log.warn(`Factor ${factor.toFixed(2)}x capped at 4x — check YAML window for seg ${i}`);
      }
      const fitPath = pathJoin(fitDir, `fit-${i}.mp3`);
      log.info(`Fitting seg ${sorted[i].filePath.split('/').pop()} to window: ${audioDurMs.toFixed(0)}ms → ${windowMs.toFixed(0)}ms (×${factor.toFixed(3)})`);
      await runFfmpeg(['-y', '-i', seg.filePath, '-af', atempoChain, fitPath]);
      fittedSegments.push({ filePath: fitPath, delayMs: seg.delayMs });
    } else {
      fittedSegments.push({ filePath: seg.filePath, delayMs: seg.delayMs });
    }
  }

  const count = fittedSegments.length;

  const inputs: string[] = ['-y', '-i', videoPath];
  fittedSegments.forEach((seg) => {
    inputs.push('-i', seg.filePath);
  });

  // Cada segmento se normaliza a -16 LUFS con ganancia lineal (dos pasadas:
  // medir → volume=XdB).  amix corre con normalize=0 y sin solapamientos.
  const gains = await Promise.all(fittedSegments.map(async (seg) => {
    const gain = await linearNormalizationGainDb(seg.filePath);
    log.debug(`Gain for ${seg.filePath}: ${gain.toFixed(1)}dB`);
    return gain;
  }));

  const last = fittedSegments[fittedSegments.length - 1];
  const lastDurMs = (await getVideoDuration(last.filePath)) * 1000;
  if (lastDurMs > 0 && last.delayMs + lastDurMs > videoDurMs) {
    log.warn(
      `Narración final termina en ${((last.delayMs + lastDurMs) / 1000).toFixed(1)}s ` +
      `pero el video dura ${(videoDurMs / 1000).toFixed(1)}s: puede quedar CORTADA.`,
    );
  }

  const filterParts: string[] = [];
  fittedSegments.forEach((seg, i) => {
    const inputIdx = i + 1;
    const delay = Math.round(seg.delayMs);
    filterParts.push(
      `[${inputIdx}:a]volume=${gains[i].toFixed(2)}dB,aresample=44100,adelay=${delay}|${delay}[a${i}]`,
    );
  });

  const mixInputs = fittedSegments.map((_, i) => `[a${i}]`).join('');
  filterParts.push(
    `${mixInputs}amix=inputs=${count}:duration=longest:dropout_transition=0:normalize=0[amixed]`,
  );
  // apad + -shortest: el audio (infinito por el pad) se corta al largo del
  // VIDEO. Sin apad, -shortest corta el video donde termina la última
  // narración y se pierde todo lo que pasa en pantalla después.
  filterParts.push(`[amixed]alimiter=limit=0.95:level=false,apad[aout]`);

  const filterComplex = filterParts.join(';');

  await runFfmpeg([
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', AUDIO_CODEC,
    '-shortest',
    outputPath,
  ]);

  // Cleanup temp speed-fitted files
  await rmDir(fitDir, { recursive: true, force: true });
}

/** Generate an optimized GIF from a video */
export async function videoToGif(
  inputPath: string,
  outputPath: string,
  fps: number,
  width: number,
): Promise<void> {
  log.info(`Generating GIF: ${outputPath} (${width}px, ${fps}fps)`);
  await runFfmpeg([
    '-y',
    '-i', inputPath,
    '-vf',
    `fps=${fps},scale=${width}:-1:flags=${GIF_LANCZOS_FLAGS},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
    outputPath,
  ]);
}

/** Get video duration in seconds */
export async function getVideoDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    return parseFloat(stdout.trim());
  } catch {
    log.warn(`Could not get duration for ${filePath}, returning 0`);
    return 0;
  }
}

/** Speed up a video by the given factor (video + audio) */
export async function speedUpVideo(
  inputPath: string,
  outputPath: string,
  factor: number,
): Promise<void> {
  log.info(`Speeding up ${factor}x: ${inputPath} → ${outputPath}`);

  // atempo only supports 0.5–2.0; for factor=1.25 this is fine
  const videoFilter = `setpts=PTS/${factor}`;
  const audioFilter = `atempo=${factor}`;

  await runFfmpeg([
    '-y',
    '-i', inputPath,
    '-filter_complex',
    `[0:v]${videoFilter}[vout];[0:a]${audioFilter}[aout]`,
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', VIDEO_CODEC,
    '-preset', VIDEO_PRESET,
    '-crf', String(VIDEO_CRF),
    '-c:a', AUDIO_CODEC,
    '-pix_fmt', 'yuv420p',
    outputPath,
  ]);
}

// ── Social Clip Functions ──────────────────────────────────────────

/** Trim a video to a time range */
export async function trimVideo(
  inputPath: string,
  outputPath: string,
  startMs: number,
  endMs: number,
  options?: { silent?: boolean },
): Promise<void> {
  const startSec = (startMs / 1000).toFixed(3);
  const durationSec = ((endMs - startMs) / 1000).toFixed(3);
  log.info(`Trimming ${startSec}s–${(endMs / 1000).toFixed(1)}s → ${outputPath}`);

  const args = [
    '-y',
    '-ss', startSec,
    '-i', inputPath,
    '-t', durationSec,
    '-c:v', VIDEO_CODEC,
    '-preset', VIDEO_PRESET,
    '-crf', String(VIDEO_CRF),
    '-pix_fmt', 'yuv420p',
  ];

  if (options?.silent) {
    args.push('-an');
  } else {
    args.push('-c:a', AUDIO_CODEC);
  }

  args.push(outputPath);
  await runFfmpeg(args);
}

interface AspectRatioOptions {
  targetWidth: number;
  targetHeight: number;
  mode: 'blur-background' | 'crop';
}

/** Adapt video to a target aspect ratio using blur-background or crop */
export async function adaptToAspectRatio(
  inputPath: string,
  outputPath: string,
  options: AspectRatioOptions,
): Promise<void> {
  const { targetWidth, targetHeight, mode } = options;
  log.info(`Adapting to ${targetWidth}x${targetHeight} (${mode}) → ${outputPath}`);

  let filterComplex: string;

  if (mode === 'blur-background') {
    // Create blurred scaled background, overlay the original centered
    filterComplex = [
      `[0:v]split=2[bg][fg]`,
      `[bg]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},boxblur=20:5[blurred]`,
      `[fg]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease[scaled]`,
      `[blurred][scaled]overlay=(W-w)/2:(H-h)/2,setsar=1[vout]`,
    ].join(';');
  } else {
    // Crop: scale up then crop to exact dimensions
    filterComplex =
      `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1[vout]`;
  }

  const args = [
    '-y',
    '-i', inputPath,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
  ];

  // Preserve audio if present
  args.push('-map', '0:a?', '-c:a', AUDIO_CODEC);
  args.push(
    '-c:v', VIDEO_CODEC,
    '-preset', VIDEO_PRESET,
    '-crf', String(VIDEO_CRF),
    '-pix_fmt', 'yuv420p',
    outputPath,
  );

  await runFfmpeg(args);
}

export interface SubtitleEntry {
  text: string;
  startSec: number;
  endSec: number;
}

interface SubtitleStyle {
  fontSize?: number;
  fontName?: string;
  fontColor?: string;
  borderColor?: string;
  borderW?: number;
  marginV?: number;
  boxEnabled?: boolean;
  boxColor?: string;
  boxPadding?: number;
}

/** Burn subtitles into a video using drawtext filters (no libass required) */
export async function addSubtitles(
  inputPath: string,
  entries: SubtitleEntry[],
  outputPath: string,
  style?: SubtitleStyle,
): Promise<void> {
  log.info(`Adding ${entries.length} subtitle entries → ${outputPath}`);

  if (entries.length === 0) {
    await runFfmpeg(['-y', '-i', inputPath, '-c', 'copy', outputPath]);
    return;
  }

  const fontSize = style?.fontSize ?? 24;
  const fontName = style?.fontName ?? 'Arial';
  const fontColor = style?.fontColor ?? 'black';
  const borderColor = style?.borderColor ?? 'black';
  const borderW = style?.borderW ?? 0;
  const marginV = style?.marginV ?? 50;
  const boxColor = style?.boxColor ?? 'white@0.85';
  const boxPadding = style?.boxPadding ?? 12;

  // Build a chain of drawtext filters, one per subtitle entry
  const drawTextFilters = entries.map((entry) => {
    const escaped = escapeDrawtext(entry.text);
    const start = entry.startSec.toFixed(3);
    const end = entry.endSec.toFixed(3);
    // Solid box background for readability on mobile
    return `drawtext=text='${escaped}':fontcolor=${fontColor}:fontsize=${fontSize}:font='${fontName}':borderw=${borderW}:bordercolor=${borderColor}:box=1:boxcolor=${boxColor}:boxborderw=${boxPadding}:x=(w-text_w)/2:y=h-text_h-${marginV}:enable='between(t\\,${start}\\,${end})'`;
  });

  const vf = drawTextFilters.join(',');

  await runFfmpeg([
    '-y',
    '-i', inputPath,
    '-vf', vf,
    '-c:v', VIDEO_CODEC,
    '-preset', VIDEO_PRESET,
    '-crf', String(VIDEO_CRF),
    '-c:a', AUDIO_CODEC,
    '-pix_fmt', 'yuv420p',
    outputPath,
  ]);
}

interface LogoOverlayOptions {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity?: number;
  marginX?: number;
  marginY?: number;
  scale?: number;
}

/** Overlay a PNG logo on the video */
export async function addLogoOverlay(
  inputPath: string,
  outputPath: string,
  logoPath: string,
  options?: LogoOverlayOptions,
): Promise<void> {
  log.info(`Adding logo overlay → ${outputPath}`);

  const position = options?.position ?? 'top-right';
  const opacity = options?.opacity ?? 0.8;
  const mx = options?.marginX ?? 20;
  const my = options?.marginY ?? 20;
  const scale = options?.scale ?? 0.12;

  // Position calculations
  const posMap: Record<string, string> = {
    'top-left': `x=${mx}:y=${my}`,
    'top-right': `x=W-w-${mx}:y=${my}`,
    'bottom-left': `x=${mx}:y=H-h-${my}`,
    'bottom-right': `x=W-w-${mx}:y=H-h-${my}`,
  };

  const filterComplex = [
    `[1:v]scale=iw*${scale}:ih*${scale},colorchannelmixer=aa=${opacity}[logo]`,
    `[0:v][logo]overlay=${posMap[position]}[vout]`,
  ].join(';');

  await runFfmpeg([
    '-y',
    '-i', inputPath,
    '-i', logoPath,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    '-map', '0:a?',
    '-c:v', VIDEO_CODEC,
    '-preset', VIDEO_PRESET,
    '-crf', String(VIDEO_CRF),
    '-c:a', AUDIO_CODEC,
    '-pix_fmt', 'yuv420p',
    outputPath,
  ]);
}

export interface SlideConfig {
  width: number;
  height: number;
  durationSec: number;
  bgColor: string;
  text: string;
  textColor: string;
  fontSize: number;
  fontName?: string;
  subtitleText?: string;
  subtitleFontSize?: number;
  logoPath?: string;
  logoScale?: number;
  audioPath?: string;
}

/** Generate a color slide with text (intro/outro) and audio track (silent or from file) */
export async function generateSlide(
  outputPath: string,
  config: SlideConfig,
): Promise<void> {
  // If an audio file is provided, use its duration instead of the config duration
  let dur = config.durationSec;
  if (config.audioPath) {
    const audioDur = await getVideoDuration(config.audioPath);
    if (audioDur > 0) {
      dur = audioDur + 0.5; // small padding at the end
      log.info(`Slide duration from audio: ${dur.toFixed(1)}s`);
    }
  }

  log.info(`Generating slide: "${config.text.slice(0, 50)}" (${dur.toFixed(1)}s) → ${outputPath}`);

  const fontName = config.fontName ?? 'Arial';
  const escapedText = escapeDrawtext(config.text);

  const hasLogo = !!config.logoPath;
  const logoScale = config.logoScale ?? 0.15;

  // Position text lower if logo is present (logo goes above text)
  const textY = hasLogo ? '(h/2+h*0.05)' : '(h-text_h)/2';

  // Build video filter chain starting from color source
  let videoFilter = `drawtext=text='${escapedText}':fontcolor=${config.textColor}:fontsize=${config.fontSize}:font='${fontName}':x=(w-text_w)/2:y=${textY}`;

  // Add subtitle text below main text if present
  if (config.subtitleText) {
    const subSize = config.subtitleFontSize ?? Math.round(config.fontSize * 0.5);
    const escapedSub = escapeDrawtext(config.subtitleText);
    const subY = hasLogo
      ? `(h/2+h*0.05+${Math.round(config.fontSize * 1.2)})`
      : `(h/2+${Math.round(config.fontSize * 0.8)})`;
    videoFilter += `,drawtext=text='${escapedSub}':fontcolor=${config.textColor}@0.7:fontsize=${subSize}:font='${fontName}':x=(w-text_w)/2:y=${subY}`;
  }

  if (hasLogo) {
    // Use filter_complex to overlay logo centered above text
    const colorSrc = `color=c=${config.bgColor}:s=${config.width}x${config.height}:d=${dur}:r=30`;
    const filterComplex = [
      `[1:v]scale=iw*${logoScale}:ih*${logoScale}[logo]`,
      `[0:v][logo]overlay=(W-w)/2:(H*0.2)[withlogo]`,
      `[withlogo]${videoFilter}[vout]`,
    ].join(';');

    const args = [
      '-y',
      '-f', 'lavfi', '-i', colorSrc,
      '-i', config.logoPath!,
    ];

    // Audio source
    if (config.audioPath) {
      args.push('-i', config.audioPath);
    } else {
      args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
    }

    args.push(
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-map', config.audioPath ? '2:a' : '2:a',
      '-t', String(dur),
      '-c:v', VIDEO_CODEC,
      '-preset', VIDEO_PRESET,
      '-c:a', AUDIO_CODEC,
      '-pix_fmt', 'yuv420p',
      '-shortest',
      outputPath,
    );

    await runFfmpeg(args);
  } else {
    // No logo — simple filter chain
    const args = [
      '-y',
      '-f', 'lavfi', '-i', `color=c=${config.bgColor}:s=${config.width}x${config.height}:d=${dur}:r=30`,
    ];

    // Audio source
    if (config.audioPath) {
      args.push('-i', config.audioPath);
    } else {
      args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
    }

    args.push(
      '-vf', videoFilter,
      '-t', String(dur),
      '-c:v', VIDEO_CODEC,
      '-preset', VIDEO_PRESET,
      '-c:a', AUDIO_CODEC,
      '-pix_fmt', 'yuv420p',
      '-shortest',
      outputPath,
    );

    await runFfmpeg(args);
  }
}

/** Concatenate multiple clips into one video */
export async function concatenateClips(
  clips: string[],
  outputPath: string,
): Promise<void> {
  if (clips.length === 0) throw new Error('No clips to concatenate');
  if (clips.length === 1) {
    // Just copy
    await runFfmpeg(['-y', '-i', clips[0], '-c', 'copy', outputPath]);
    return;
  }

  log.info(`Concatenating ${clips.length} clips → ${outputPath}`);

  const inputs: string[] = ['-y'];
  clips.forEach((clip) => {
    inputs.push('-i', clip);
  });

  // Los clips pueden venir en resoluciones distintas (ej. slides 1920x1080 y
  // contenido 1280x720): concat exige mismo tamaño, así que se normaliza todo
  // a la resolución más grande con scale+pad.
  let targetW = 0;
  let targetH = 0;
  for (const clip of clips) {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'json', clip,
    ]);
    const stream = JSON.parse(stdout).streams?.[0];
    if (stream && stream.width * stream.height > targetW * targetH) {
      targetW = stream.width;
      targetH = stream.height;
    }
  }
  if (targetW === 0 || targetH === 0) { targetW = 1920; targetH = 1080; }

  // Normalize each clip's video (size, SAR, fps) and audio (sample rate, channels) before concat
  const normParts: string[] = [];
  const concatInputs: string[] = [];
  clips.forEach((_, i) => {
    normParts.push(
      `[${i}:v:0]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,` +
      `pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`,
    );
    normParts.push(`[${i}:a:0]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
    concatInputs.push(`[v${i}][a${i}]`);
  });

  const filterComplex = normParts.join(';') + ';' +
    concatInputs.join('') + `concat=n=${clips.length}:v=1:a=1[vout][aout]`;

  await runFfmpeg([
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', VIDEO_CODEC,
    '-preset', VIDEO_PRESET,
    '-crf', String(VIDEO_CRF),
    '-c:a', AUDIO_CODEC,
    '-pix_fmt', 'yuv420p',
    outputPath,
  ]);
}

/** Replace a video's audio track with a new audio file */
export async function replaceVideoAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string,
): Promise<void> {
  log.info(`Replacing audio: ${videoPath} + ${audioPath} → ${outputPath}`);
  await runFfmpeg([
    '-y',
    '-i', videoPath,
    '-i', audioPath,
    '-map', '0:v',
    '-map', '1:a',
    '-c:v', 'copy',
    '-c:a', AUDIO_CODEC,
    '-shortest',
    outputPath,
  ]);
}

/** Escape text for FFmpeg drawtext filter */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%');
}
