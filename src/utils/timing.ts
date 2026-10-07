import type { TimingMarker } from '../config/constants.js';

/** Manages timing markers during recording */
export class TimingTracker {
  private markers: TimingMarker[] = [];
  private recordingStartMs = 0;
  private currentSegmentStart = 0;
  private videoStartMs = 0;

  /** Call when video recording starts (before login) */
  setVideoStart(): void {
    this.videoStartMs = Date.now();
  }

  /** Get the offset between video start and recording start (login duration) */
  getLoginOffsetMs(): number {
    if (this.videoStartMs === 0) return 0;
    return this.recordingStartMs - this.videoStartMs;
  }

  /** Call when recording starts */
  startRecording(): void {
    this.recordingStartMs = Date.now();
    this.currentSegmentStart = this.recordingStartMs;
  }

  /** Mark the start of a new segment */
  startSegment(segmentId: string): void {
    this.currentSegmentStart = Date.now();
  }

  /** Mark the end of the current segment */
  endSegment(segmentId: string): void {
    const now = Date.now();
    this.markers.push({
      segmentId,
      startMs: this.currentSegmentStart - this.recordingStartMs,
      endMs: now - this.recordingStartMs,
    });
  }

  /** Get all timing markers */
  getMarkers(): TimingMarker[] {
    return [...this.markers];
  }

  /** Get elapsed time since recording started in ms */
  getElapsedMs(): number {
    return Date.now() - this.recordingStartMs;
  }

  /** Get total recording duration in ms */
  getTotalDurationMs(): number {
    if (this.markers.length === 0) return 0;
    return this.markers[this.markers.length - 1].endMs;
  }
}

/** Sleep for a specified number of milliseconds */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Calculate estimated narration duration based on word count */
export function estimateNarrationDurationMs(text: string, wordsPerMinute = 150): number {
  const wordCount = text.split(/\s+/).length;
  return Math.ceil((wordCount / wordsPerMinute) * 60 * 1000);
}
