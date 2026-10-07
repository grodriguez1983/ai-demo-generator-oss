import { mkdir, rm, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  OUTPUT_DIR,
  VIDEOS_DIR,
  AUDIO_DIR,
  SCRIPTS_DIR,
  FINAL_DIR,
  SCREENSHOTS_DIR,
  CLIPS_DIR,
  SUBTITLES_DIR,
} from '../config/constants.js';

/** Get project root (where package.json lives) */
export function getProjectRoot(): string {
  return resolve(import.meta.dirname, '../..');
}

/** Resolve a path relative to the project root */
export function resolvePath(...segments: string[]): string {
  return join(getProjectRoot(), ...segments);
}

/** Ensure all output directories exist */
export async function ensureOutputDirs(): Promise<void> {
  const dirs = [OUTPUT_DIR, VIDEOS_DIR, AUDIO_DIR, SCRIPTS_DIR, FINAL_DIR, SCREENSHOTS_DIR, CLIPS_DIR, SUBTITLES_DIR];
  await Promise.all(dirs.map((dir) => mkdir(resolvePath(dir), { recursive: true })));
}

/** Get output file path for a demo */
export function getOutputPath(dir: string, demoId: string, extension: string): string {
  return resolvePath(dir, `${demoId}${extension}`);
}

/** Check if a file exists */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Clean demo-specific output files */
export async function cleanDemoOutput(demoId: string): Promise<void> {
  const files = [
    getOutputPath(VIDEOS_DIR, demoId, '.webm'),
    getOutputPath(AUDIO_DIR, demoId, '.mp3'),
    getOutputPath(SCRIPTS_DIR, demoId, '.json'),
    getOutputPath(FINAL_DIR, demoId, '.mp4'),
    getOutputPath(FINAL_DIR, demoId, '.gif'),
  ];

  await Promise.all(
    files.map((f) => rm(f, { force: true }).catch(() => {})),
  );
}
