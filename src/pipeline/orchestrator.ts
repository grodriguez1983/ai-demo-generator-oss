import type { EnvConfig, PipelineOptions } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';
import { ensureOutputDirs } from '../utils/file-utils.js';
import { checkFfmpeg } from '../utils/ffmpeg.js';
import { seedDemoData } from './seed-demo-data.js';
import { recordAllDemos, loadDemoConfigs } from './record-demo.js';
import { generateScript, loadScript } from './generate-script.js';
import { generateVoice, buildDemoTimingMap } from './generate-voice.js';
import { renderVideo } from './render-video.js';
import { generateClips } from './generate-clips.js';
import type { FlowResult } from '../flows/base-flow.js';

const log = createLogger('pipeline');

/** Run the full demo generation pipeline */
export async function runPipeline(
  config: EnvConfig,
  options: PipelineOptions,
): Promise<void> {
  const startTime = Date.now();
  log.stage('AI Demo Generator');
  log.info(`Options: ${JSON.stringify(options)}`);

  // Verify prerequisites
  await verifyPrerequisites(options);

  // Ensure output directories exist
  await ensureOutputDirs();

  // Stage 1: Seed
  if (!options.skipSeed) {
    try {
      await seedDemoData();
    } catch (error) {
      log.warn(`Seed failed (non-fatal): ${error}`);
    }
  } else {
    log.info('Skipping seed (--skip-seed)');
  }

  // Stage 2: Record
  let flowResults: FlowResult[] = [];
  if (!options.skipRecord) {
    flowResults = await recordAllDemos(config, options.demoId);
  } else {
    log.info('Skipping recording (--skip-record)');
  }

  // If dry-run, stop here
  if (options.dryRun) {
    log.info('Dry run complete. Videos recorded but no audio/render.');
    logSummary(startTime);
    return;
  }

  // Load demo configs for script generation
  const demosConfig = await loadDemoConfigs(options.demoId);
  const demosToProcess = options.demoId
    ? demosConfig.demos.filter((d) => d.id === options.demoId)
    : demosConfig.demos;

  for (const demo of demosToProcess) {
    // Stage 3: Generate script
    const flowResult = flowResults.find((r) => r.demoId === demo.id);
    if (!options.skipScript) {
      const markers = flowResult?.timingTracker.getMarkers();

      if (markers && markers.length > 0) {
        await generateScript(demo, markers, flowResult?.loginOffsetMs);
      } else {
        log.warn(`No timing markers for ${demo.id}, trying to load existing script`);
      }
    } else {
      log.info(`Skipping script generation for ${demo.id}`);
    }

    // Stage 4: Generate voice
    const script = await loadScript(demo.id);
    let audioSegments: { segmentId: string; filePath: string; delayMs: number }[] = [];

    if (!options.skipVoice && script) {
      audioSegments = await generateVoice(config, script, demo);
    } else if (options.skipVoice && script) {
      log.info(`Skipping voice generation for ${demo.id}`);
      // Load existing audio segments from disk. When the YAML was recalibrated,
      // demo.segments is the source of truth; stale script timestamps must not be
      // reused for the final mix because they reintroduce dead air.
      const { AUDIO_DIR } = await import('../config/constants.js');
      const { getOutputPath, fileExists } = await import('../utils/file-utils.js');
      const demoTimingMap = buildDemoTimingMap(demo);
      for (const seg of script.segments) {
        // Igual que generateVoice: los segmentos sin texto NO llevan audio.
        // Sin este filtro, un mp3 viejo de un guión anterior (mismo id,
        // texto ahora vacío) se mezcla encima de la narración nueva.
        if (!seg.text.trim()) continue;
        const audioPath = getOutputPath(AUDIO_DIR, `${demo.id}-${seg.segmentId}`, '.mp3');
        if (await fileExists(audioPath)) {
          audioSegments.push({
            segmentId: seg.segmentId,
            filePath: audioPath,
            delayMs: Number.isFinite(seg.startMs) ? seg.startMs : (demoTimingMap.get(seg.segmentId) ?? 0),
          });
        }
      }
      if (audioSegments.length > 0) {
        log.info(`Loaded ${audioSegments.length} existing audio segments for ${demo.id}`);
      }
    }

    // Stage 5: Render
    if (!options.skipRender) {
      try {
        const markers = flowResult?.timingTracker.getMarkers() ?? [];
        const loginOffset = flowResult?.loginOffsetMs ?? script?.loginOffsetMs;

        // Build timing markers from script if no flow markers available
        const timingMarkers = markers.length > 0
          ? markers
          : script?.segments.map((s) => ({
              segmentId: s.segmentId,
              startMs: s.startMs,
              endMs: s.endMs,
            }));

        const { mp4Path, gifPath } = await renderVideo(config, demo.id, audioSegments, demo, {
          loginOffsetMs: loginOffset,
          timingMarkers,
          branding: demo.skip_branding ? undefined : (demo.branding ?? demosConfig.branding),
        });
        log.info(`Output: ${mp4Path}`);
        log.info(`Output: ${gifPath}`);
      } catch (error) {
        log.error(`Render failed for ${demo.id}: ${error}`);
      }
    } else {
      log.info(`Skipping render for ${demo.id}`);
    }

    // Stage 6: Social Clips
    if (!options.skipClips) {
      try {
        await generateClips(demo, config, demosConfig.branding);
      } catch (error) {
        log.error(`Clip generation failed for ${demo.id}: ${error}`);
      }
    } else {
      log.info(`Skipping clips for ${demo.id}`);
    }
  }

  logSummary(startTime);
}

async function verifyPrerequisites(options: PipelineOptions): Promise<void> {
  // Check ffmpeg (needed for render or clips stages)
  if ((!options.skipRender || !options.skipClips) && !options.dryRun) {
    const hasFfmpeg = await checkFfmpeg();
    if (!hasFfmpeg) {
      throw new Error(
        'ffmpeg is not installed. Install it with: brew install ffmpeg\n' +
        'Or run with --skip-render to skip the render stage.',
      );
    }
  }
}

function logSummary(startTimeMs: number): void {
  const elapsed = ((Date.now() - startTimeMs) / 1000).toFixed(1);
  console.log('\n');
  log.stage('Pipeline Complete');
  log.info(`Total time: ${elapsed}s`);
}
