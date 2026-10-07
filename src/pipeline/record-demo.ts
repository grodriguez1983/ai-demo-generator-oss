import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { DemoConfig, DemosConfig, EnvConfig } from '../config/constants.js';
import { demosConfigSchema } from '../config/constants.js';
import { resolvePath } from '../utils/file-utils.js';
import { createLogger } from '../utils/logger.js';
import type { FlowResult } from '../flows/base-flow.js';
import { DeclarativeFlow } from '../flows/declarative-flow.js';

const log = createLogger('record');

/**
 * Load and validate demo configurations.
 *
 * `src/config/demos.yaml` holds the shared defaults (global `branding`) plus any
 * demos you want available without a `--demo=<id>` flag. Each demo normally lives
 * in its own `src/config/<id>.yaml` and is loaded on demand.
 */
export async function loadDemoConfigs(demoId?: string): Promise<DemosConfig> {
  const yamlPath = resolvePath('src/config/demos.yaml');
  const yamlContent = await readFile(yamlPath, 'utf-8');
  const parsed = parseYaml(yamlContent);
  const config = demosConfigSchema.parse(parsed);

  // If a specific demo is requested and not found, try loading from a standalone YAML
  if (demoId && !config.demos.some((d) => d.id === demoId)) {
    const standalone = await loadStandaloneDemo(demoId);
    if (standalone) {
      config.demos.push(...standalone);
    }
  }

  return config;
}

/** Try loading a demo from src/config/{demoId}.yaml */
async function loadStandaloneDemo(demoId: string): Promise<DemoConfig[] | null> {
  const filePath = resolvePath(`src/config/${demoId}.yaml`);
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = parseYaml(content);
    // Standalone files can be an array of demos or a single demo object
    const demos = Array.isArray(parsed) ? parsed : [parsed];
    return demos.map((d) => demosConfigSchema.shape.demos.element.parse(d));
  } catch (error) {
    // An invalid standalone YAML must not fail silently: the pipeline would
    // otherwise continue with "Demo not found" and no hint of the real problem.
    log.error(`Could not load src/config/${demoId}.yaml: ${error}`);
    return null;
  }
}

/**
 * Every demo is recorded with the declarative flow: each segment is an `actions`
 * array interpreted against the page. There are no app-specific flow classes —
 * what the browser does is fully described in the YAML.
 */
function assertDeclarative(demo: DemoConfig): void {
  const nonDeclarative = demo.segments.filter((s) => s.actions == null);
  if (nonDeclarative.length > 0) {
    throw new Error(
      `Demo "${demo.id}" has segments without an "actions" array: ` +
        `${nonDeclarative.map((s) => s.id).join(', ')}. ` +
        'Every segment must describe its steps declaratively (see docs/playbooks/nuevo-demo.md).',
    );
  }
}

/** Record a single demo */
export async function recordDemo(config: EnvConfig, demo: DemoConfig): Promise<FlowResult> {
  log.stage(`Recording: ${demo.title}`);

  assertDeclarative(demo);
  const flow = new DeclarativeFlow(config, demo);
  const result = await flow.run();

  log.info(`Recording complete: ${result.videoPath}`);
  log.info(`Segments recorded: ${result.timingTracker.getMarkers().length}`);
  log.info(`Total duration: ${(result.timingTracker.getTotalDurationMs() / 1000).toFixed(1)}s`);
  log.info(`Screenshots: ${result.screenshotPaths.length}`);

  return result;
}

/** Record all demos or a specific one */
export async function recordAllDemos(
  config: EnvConfig,
  demoId?: string,
): Promise<FlowResult[]> {
  const demosConfig = await loadDemoConfigs(demoId);
  const results: FlowResult[] = [];

  const demosToRecord = demoId
    ? demosConfig.demos.filter((d) => d.id === demoId)
    : demosConfig.demos;

  if (demosToRecord.length === 0) {
    throw new Error(
      `Demo not found: ${demoId}. Available: ${demosConfig.demos.map((d) => d.id).join(', ') || '(none in demos.yaml)'}`,
    );
  }

  for (const demo of demosToRecord) {
    const result = await recordDemo(config, demo);
    results.push(result);
  }

  return results;
}
