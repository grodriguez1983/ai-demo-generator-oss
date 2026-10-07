import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '../utils/logger.js';

const log = createLogger('seed');
const execAsync = promisify(exec);

/**
 * Stage 1 — Seed.
 *
 * Recording a demo assumes the target app is in a known, deterministic state
 * (the records the video shows exist; what the video creates on camera is
 * cleaned up beforehand). *How* to reach that state is app-specific, so this
 * pipeline treats seeding as a port: you plug in a command, we run it.
 *
 * Set `SEED_COMMAND` in `.env` to anything your shell can run, e.g.:
 *   SEED_COMMAND="npm --prefix ../my-app run db:seed:demo"
 *
 * If it is empty, this stage is a no-op (use `--skip-seed` to silence the log).
 * A seed that is just "visit a public URL" needs no command at all.
 */
export async function seedDemoData(): Promise<void> {
  const command = process.env.SEED_COMMAND?.trim();

  if (!command) {
    log.info('No SEED_COMMAND configured — skipping seed (the demo must already be in a known state).');
    return;
  }

  log.stage('Seed Demo Data');
  log.info(`Running: ${command}`);

  const { stdout, stderr } = await execAsync(command, {
    cwd: process.env.SEED_CWD?.trim() || process.cwd(),
    env: process.env,
  });
  if (stdout.trim()) log.info(stdout.trim());
  if (stderr.trim()) log.warn(stderr.trim());

  log.info('Seed complete.');
}
