import { writeFile } from 'node:fs/promises';
import type { NarrationScript } from '../pipeline/generate-script.js';

/** Format milliseconds as SRT timestamp: HH:MM:SS,mmm */
export function formatSrtTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(ms % 1000);

  return (
    String(hours).padStart(2, '0') + ':' +
    String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0') + ',' +
    String(millis).padStart(3, '0')
  );
}

/** Split text into lines of maxChars for subtitle readability */
export function splitSubtitleLines(text: string, maxChars = 42): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxChars && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.join('\n');
}

/** Generate a full SRT file from a NarrationScript */
export async function generateSrt(
  script: NarrationScript,
  outputPath: string,
): Promise<void> {
  const entries: string[] = [];

  script.segments.forEach((seg, i) => {
    const start = formatSrtTime(seg.startMs);
    const end = formatSrtTime(seg.endMs);
    const text = splitSubtitleLines(seg.text);
    entries.push(`${i + 1}\n${start} --> ${end}\n${text}`);
  });

  await writeFile(outputPath, entries.join('\n\n') + '\n', 'utf-8');
}

/** Generate an SRT file for a subset of segments with rebased timing */
export async function generateHighlightSrt(
  script: NarrationScript,
  segmentIds: string[],
  outputPath: string,
): Promise<void> {
  const selected = script.segments.filter((s) => segmentIds.includes(s.segmentId));
  if (selected.length === 0) {
    await writeFile(outputPath, '', 'utf-8');
    return;
  }

  const baseMs = selected[0].startMs;
  const entries: string[] = [];

  selected.forEach((seg, i) => {
    const start = formatSrtTime(seg.startMs - baseMs);
    const end = formatSrtTime(seg.endMs - baseMs);
    const text = splitSubtitleLines(seg.text);
    entries.push(`${i + 1}\n${start} --> ${end}\n${text}`);
  });

  await writeFile(outputPath, entries.join('\n\n') + '\n', 'utf-8');
}
