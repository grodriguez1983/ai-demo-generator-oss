import { rename } from 'node:fs/promises';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { AUTH, LAYOUT } from '../config/selectors.js';
import type { DemoConfig, Segment, EnvConfig } from '../config/constants.js';
import { SCREENSHOTS_DIR, VIDEOS_DIR } from '../config/constants.js';
import { TimingTracker, sleep } from '../utils/timing.js';
import { getOutputPath, ensureOutputDirs } from '../utils/file-utils.js';
import { createLogger } from '../utils/logger.js';
import { cursorGuideScript } from './cursor-guide.js';

const log = createLogger('flow');

/** Result of a recorded flow */
export interface FlowResult {
  demoId: string;
  videoPath: string;
  timingTracker: TimingTracker;
  screenshotPaths: string[];
  loginOffsetMs: number;
}

/** Abstract base class for demo flows */
export abstract class BaseFlow {
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected timingTracker = new TimingTracker();
  protected screenshotPaths: string[] = [];
  protected config: EnvConfig;
  protected demo: DemoConfig;

  constructor(config: EnvConfig, demo: DemoConfig) {
    this.config = config;
    this.demo = demo;
  }

  /**
   * Execute a specific segment action.
   * Subclasses implement this to define what each action does.
   */
  protected abstract executeAction(action: string, page: Page): Promise<void>;

  /** Run the full flow: setup → record → execute segments → teardown */
  async run(): Promise<FlowResult> {
    await ensureOutputDirs();
    const videoPath = getOutputPath(VIDEOS_DIR, this.demo.id, '.webm');

    try {
      await this.setupBrowser(videoPath);
      this.timingTracker.setVideoStart();
      // Reels de concepto no tienen app ni login: skip_login navega directo a
      // las pantallas HTML estáticas (loginOffset queda ~0, sin trimming).
      if (!this.demo.skip_login) {
        await this.login();
      }

      this.timingTracker.startRecording();

      for (const segment of this.demo.segments) {
        await this.executeSegment(segment);
      }

      await this.teardown();

      return {
        demoId: this.demo.id,
        videoPath,
        timingTracker: this.timingTracker,
        screenshotPaths: this.screenshotPaths,
        loginOffsetMs: this.timingTracker.getLoginOffsetMs(),
      };
    } catch (error) {
      await this.teardown();
      throw error;
    }
  }

  /** Launch browser with video recording */
  private async setupBrowser(videoPath: string): Promise<void> {
    log.info(`Setting up browser for "${this.demo.id}"`);

    const viewportWidth = this.demo.viewport_width ?? this.demo.video_width ?? this.config.VIDEO_WIDTH;
    const viewportHeight = this.demo.viewport_height ?? this.demo.video_height ?? this.config.VIDEO_HEIGHT;

    log.info(`Viewport: ${viewportWidth}x${viewportHeight}`);
    if (this.demo.video_width && this.demo.video_height) {
      log.info(`Target video: ${this.demo.video_width}x${this.demo.video_height} (upscaled in post)`);
    }

    this.browser = await chromium.launch({
      headless: true,
    });

    // Record at viewport size. If target video is larger (e.g., 1080x1920),
    // upscaling happens in the FFmpeg render step for crisp output.
    this.context = await this.browser.newContext({
      viewport: {
        width: viewportWidth,
        height: viewportHeight,
      },
      locale: this.demo.locale,
      recordVideo: {
        dir: getOutputPath(VIDEOS_DIR, '', '').replace(/\/$/, ''),
        size: {
          width: viewportWidth,
          height: viewportHeight,
        },
      },
    });

    // Cursor-guía para tutoriales: se inyecta en cada navegación (persistente).
    if (this.demo.cursor_guide) {
      await this.context.addInitScript({ content: cursorGuideScript });
    }

    this.page = await this.context.newPage();
  }

  /** Login using CSRF + credentials (matches global-setup.ts pattern) */
  private async login(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    log.info('Logging in...');

    // Navigate to login page
    await this.page.goto(`${this.config.BASE_URL}/${this.demo.locale}/login`, { timeout: 60000 });
    await this.page.waitForLoadState('networkidle', { timeout: 60000 });

    // Fill credentials
    await this.page.fill(AUTH.emailInput, this.config.DEMO_EMAIL);
    await this.page.fill(AUTH.passwordInput, this.config.DEMO_PASSWORD);

    // Submit
    await this.page.click(AUTH.submitButton);

    // Wait for redirect away from login page
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 60000,
    });
    await this.page.waitForLoadState('networkidle', { timeout: 60000 });

    // If redirected to root, navigate to dashboard explicitly
    if (this.page.url().match(/\/[a-z]{2}\/?$/)) {
      await this.page.goto(`${this.config.BASE_URL}/${this.demo.locale}/dashboard`, { timeout: 60000 });
      await this.page.waitForLoadState('networkidle', { timeout: 60000 });
    }

    log.info('Login successful');
  }

  /** Execute a single segment with timing markers */
  private async executeSegment(segment: Segment): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    log.info(`Segment: ${segment.id} (${segment.action ?? 'declarative'})`);

    this.timingTracker.startSegment(segment.id);

    // Execute the action
    await this.executeAction(segment.action ?? segment.id, this.page);

    // Wait for any loading to complete
    await this.waitForStable();

    // Highlight elements if specified
    if (segment.highlight_elements) {
      await this.highlightElements(segment.highlight_elements);
    }

    // Take screenshot
    await this.takeScreenshot(segment.id);

    // Pause for visual effect
    await sleep(segment.pause_after_ms);

    this.timingTracker.endSegment(segment.id);
  }

  /** Wait for page to be stable (no spinners, network idle) */
  protected async waitForStable(): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch {
      // Network might not fully idle, continue anyway
    }
    // Wait for spinners to disappear
    try {
      await this.page.waitForSelector(LAYOUT.loadingSpinner, {
        state: 'hidden',
        timeout: 3000,
      });
    } catch {
      // No spinner found, that's fine
    }
  }

  /** Highlight elements with a visual overlay */
  private async highlightElements(selectors: string[]): Promise<void> {
    if (!this.page) return;
    for (const selector of selectors) {
      try {
        await this.page.evaluate((sel) => {
          const elements = document.querySelectorAll(sel);
          elements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            htmlEl.style.outline = '3px solid #3b82f6';
            htmlEl.style.outlineOffset = '2px';
            htmlEl.style.transition = 'outline 0.3s ease';
          });
        }, selector);
        await sleep(500);
        // Remove highlights
        await this.page.evaluate((sel) => {
          const elements = document.querySelectorAll(sel);
          elements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            htmlEl.style.outline = '';
            htmlEl.style.outlineOffset = '';
          });
        }, selector);
      } catch {
        log.debug(`Could not highlight: ${selector}`);
      }
    }
  }

  /** Take a screenshot for the current segment */
  private async takeScreenshot(segmentId: string): Promise<void> {
    if (!this.page) return;
    const path = getOutputPath(SCREENSHOTS_DIR, `${this.demo.id}-${segmentId}`, '.png');
    await this.page.screenshot({ path });
    this.screenshotPaths.push(path);
    log.debug(`Screenshot: ${path}`);
  }

  /** Helper to navigate to a path within the app */
  protected async navigateTo(path: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    const localePrefix = this.demo.no_locale_prefix ? '' : `/${this.demo.locale}`;
    await this.page.goto(`${this.config.BASE_URL}${localePrefix}${path}`, { timeout: 60000 });
    await this.waitForStable();
  }

  /** Helper to click a sidebar link */
  protected async clickSidebarLink(text: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    const selector = LAYOUT.sidebarLink(text);
    await this.page.click(selector);
    await this.waitForStable();
  }

  /** Helper to select a combobox option */
  protected async selectComboboxOption(
    comboboxSelector: string,
    optionText: string,
    index = 0,
  ): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    const comboboxes = this.page.locator(comboboxSelector);
    await comboboxes.nth(index).click();
    await sleep(300);
    await this.page.locator(`[role="option"]:has-text("${optionText}")`).click();
    await sleep(300);
  }

  /** Cleanup browser resources and save video */
  private async teardown(): Promise<void> {
    let recordedVideoPath: string | undefined;
    if (this.page) {
      // Get the video path before closing (Playwright generates a random name)
      recordedVideoPath = await this.page.video()?.path();
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    // Rename Playwright's random-named video to the expected path
    if (recordedVideoPath) {
      const targetPath = getOutputPath(VIDEOS_DIR, this.demo.id, '.webm');
      try {
        await rename(recordedVideoPath, targetPath);
        log.info(`Video saved: ${targetPath}`);
      } catch {
        log.warn(`Could not rename video from ${recordedVideoPath} to ${targetPath}`);
      }
    }
    log.info('Browser closed');
  }
}
