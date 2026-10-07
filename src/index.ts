import 'dotenv/config';
import { envSchema } from './config/constants.js';
import type { PipelineOptions } from './config/constants.js';
import { runPipeline } from './pipeline/orchestrator.js';
import { setLogLevel } from './utils/logger.js';

function parseArgs(args: string[]): PipelineOptions {
  const options: PipelineOptions = {
    dryRun: false,
    skipSeed: false,
    skipRecord: false,
    skipScript: false,
    skipVoice: false,
    skipRender: false,
    skipClips: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--skip-seed') options.skipSeed = true;
    else if (arg === '--skip-record') options.skipRecord = true;
    else if (arg === '--skip-script') options.skipScript = true;
    else if (arg === '--skip-voice') options.skipVoice = true;
    else if (arg === '--skip-render') options.skipRender = true;
    else if (arg === '--skip-clips') options.skipClips = true;
    else if (arg === '--verbose') setLogLevel('debug');
    else if (arg.startsWith('--demo=')) options.demoId = arg.split('=')[1];
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
AI Demo Generator

Usage:
  npx tsx src/index.ts [options]

Options:
  --demo=<id>       Record only the demo with this id (src/config/<id>.yaml)
  --dry-run         Record videos but skip script/voice/render
  --skip-seed       Skip the seed stage (SEED_COMMAND)
  --skip-record     Skip Playwright recording (use existing videos)
  --skip-script     Skip OpenAI script generation
  --skip-voice      Skip TTS voice generation
  --skip-render     Skip FFmpeg rendering
  --skip-clips      Skip social clip generation (Stage 6)
  --verbose         Enable debug logging
  --help, -h        Show this help

Examples:
  npx tsx src/index.ts --demo=example-playground            # The bundled example
  npx tsx src/index.ts --demo=example-playground --dry-run  # Record only, no AI/render
  npx tsx src/index.ts --demo=example-playground --skip-record --skip-script  # Re-render
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Validate environment
  const envResult = envSchema.safeParse(process.env);
  if (!envResult.success) {
    console.error('Environment validation failed:');
    for (const issue of envResult.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    console.error('\nCopy .env.example to .env and fill in the values.');
    process.exit(1);
  }

  try {
    await runPipeline(envResult.data, options);
  } catch (error) {
    console.error('\nPipeline failed:', error);
    process.exit(1);
  }
}

main();
