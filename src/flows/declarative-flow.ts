import type { Page } from '@playwright/test';
import { BaseFlow } from './base-flow.js';
import type { DemoConfig, DeclarativeAction, EnvConfig } from '../config/constants.js';
import { sleep } from '../utils/timing.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('declarative-flow');

/**
 * Generic flow that executes declarative actions defined in YAML segments.
 * No TypeScript flow file needed — actions are driven entirely by config.
 */
export class DeclarativeFlow extends BaseFlow {
  private actionsMap: Map<string, DeclarativeAction[]>;
  /** Variables captured with read-value/read-text, used by url_var/text_var */
  private vars = new Map<string, string>();

  constructor(config: EnvConfig, demo: DemoConfig) {
    super(config, demo);
    this.actionsMap = new Map();
    for (const segment of demo.segments) {
      if (segment.actions) {
        this.actionsMap.set(segment.id, segment.actions);
      }
    }
  }

  protected async executeAction(action: string, page: Page): Promise<void> {
    const actions = this.actionsMap.get(action);
    if (!actions) {
      log.warn(`No declarative actions found for segment: ${action}`);
      return;
    }

    for (const step of actions) {
      log.debug(`  ${step.type}: ${JSON.stringify(step)}`);
      await this.executeStep(step, page);
    }
  }

  /**
   * Cursor-guía: lleva el puntero al elemento y lo resalta ANTES de actuar,
   * para tutoriales paso a paso. No-op si el demo no tiene cursor_guide.
   * Devuelve el centro del elemento (para el ripple del click).
   */
  private async guideTo(
    selector: string,
    page: Page,
  ): Promise<{ cx: number; cy: number } | null> {
    if (!this.demo.cursor_guide) return null;
    try {
      const loc = page.locator(selector).first();
      await loc.scrollIntoViewIfNeeded({ timeout: 5000 });
      const box = await loc.boundingBox();
      if (!box) return null;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.evaluate(
        ({ cx, cy, x, y, w, h }) => {
          const win = window as unknown as Record<string, (...a: number[]) => void>;
          win.__demoRing?.(x, y, w, h);
          win.__demoMove?.(cx - 3, cy - 2);
        },
        { cx, cy, x: box.x, y: box.y, w: box.width, h: box.height },
      );
      await sleep(680);
      return { cx, cy };
    } catch {
      return null;
    }
  }

  /** Anima un "click" en el punto y oculta el anillo. No-op sin cursor_guide. */
  private async ripple(page: Page, pt: { cx: number; cy: number } | null): Promise<void> {
    if (!pt) return;
    try {
      await page.evaluate(
        ({ x, y }) => (window as unknown as Record<string, (...a: number[]) => void>).__demoRipple?.(x, y),
        { x: pt.cx, y: pt.cy },
      );
      await sleep(140);
      await page.evaluate(() =>
        (window as unknown as Record<string, () => void>).__demoRingHide?.(),
      );
    } catch {
      /* ignore */
    }
  }

  private async executeStep(step: DeclarativeAction, page: Page): Promise<void> {
    switch (step.type) {
      case 'navigate':
        if (step.url_var) {
          const url = this.vars.get(step.url_var);
          if (!url) throw new Error(`navigate: variable "${step.url_var}" was not captured`);
          await page.goto(url);
        } else if (step.path) {
          await this.navigateTo(step.path);
        } else {
          throw new Error('navigate: a path or url_var is required');
        }
        break;

      case 'click':
        if (step.optional) {
          try {
            const pt = await this.guideTo(step.selector, page);
            await page.locator(step.selector).first().click({ force: step.force, timeout: 5000 });
            await this.ripple(page, pt);
          } catch {
            log.debug(`Optional click skipped: ${step.selector}`);
          }
        } else {
          const pt = await this.guideTo(step.selector, page);
          await page.locator(step.selector).first().click({ force: step.force });
          await this.ripple(page, pt);
        }
        break;

      case 'fill':
        await this.guideTo(step.selector, page);
        await page.locator(step.selector).first().fill(step.text);
        break;

      case 'type': {
        const text = step.text_var ? this.vars.get(step.text_var) : step.text;
        if (text === undefined) {
          throw new Error(`type: no text (text, or text_var "${step.text_var}", was not captured)`);
        }
        await this.guideTo(step.selector, page);
        await page.locator(step.selector).first().pressSequentially(text, {
          delay: step.delay_ms,
        });
        break;
      }

      case 'read-value': {
        const value = await page.locator(step.selector).first().inputValue();
        this.vars.set(step.var, value);
        log.debug(`read-value ${step.var} = ${value}`);
        break;
      }

      case 'read-text': {
        const text = (await page.locator(step.selector).first().textContent())?.trim() ?? '';
        this.vars.set(step.var, text);
        log.debug(`read-text ${step.var} = ${text}`);
        break;
      }

      case 'read-url': {
        let url = page.url();
        if (step.replace) {
          url = url.replace(new RegExp(step.replace.pattern), step.replace.replacement);
        }
        this.vars.set(step.var, url);
        log.debug(`read-url ${step.var} = ${url}`);
        break;
      }

      case 'scroll':
        if (step.selector) {
          await page.locator(step.selector).first().evaluate(
            (el, opts) => el.scrollBy({ top: opts.distance, behavior: opts.behavior }),
            { distance: step.distance, behavior: step.behavior },
          );
        } else {
          await page.evaluate(
            (opts) => window.scrollBy({ top: opts.distance, behavior: opts.behavior }),
            { distance: step.distance, behavior: step.behavior },
          );
        }
        break;

      case 'scroll-to':
        await page.locator(step.selector).first().scrollIntoViewIfNeeded();
        break;

      case 'hover': {
        // Cursor-guía: lleva el puntero al elemento y lo resalta (sin click).
        // Útil para señalar botones que no queremos activar (ej: grabar audio).
        await this.guideTo(step.selector, page);
        const locator = page.locator(step.selector);
        const count = Math.min(step.count, await locator.count());
        for (let i = 0; i < count; i++) {
          await locator.nth(i).hover();
          if (i < count - 1) await sleep(step.pause_ms);
        }
        break;
      }

      case 'wait':
        if (step.selector) {
          if (step.optional) {
            try {
              await page.waitForSelector(step.selector, { timeout: step.timeout_ms });
            } catch {
              log.debug(`Optional wait timed out: ${step.selector}`);
            }
          } else {
            await page.waitForSelector(step.selector, { timeout: step.timeout_ms });
          }
        }
        if (step.ms) {
          await sleep(step.ms);
        }
        break;

      case 'wait-url':
        await page.waitForURL(step.pattern, { timeout: step.timeout_ms });
        break;

      case 'select-combobox':
        await this.guideTo(step.selector, page);
        await this.selectComboboxOption(step.selector, step.option, step.index);
        break;

      case 'press-key':
        await page.keyboard.press(step.key);
        break;

      case 'sleep':
        await sleep(step.ms);
        break;

      case 'upload-file': {
        const filePath = step.file.startsWith('/')
          ? step.file
          : `${process.cwd()}/${step.file}`;
        await page.locator(step.selector).first().setInputFiles(filePath);
        break;
      }

      case 'draw': {
        await this.guideTo(step.selector, page);
        // Draw a stroke on a <canvas> (signature pad). Uses real mouse
        // move/down/up so signature_pad captures the points.
        const box = await page.locator(step.selector).first().boundingBox();
        if (!box) {
          log.debug(`Draw skipped, no bounding box: ${step.selector}`);
          break;
        }
        // Default: a cursive-looking squiggle across the middle of the canvas.
        const pts = step.points ?? [
          { x: 0.12, y: 0.55 }, { x: 0.2, y: 0.3 }, { x: 0.28, y: 0.7 },
          { x: 0.36, y: 0.35 }, { x: 0.44, y: 0.65 }, { x: 0.52, y: 0.4 },
          { x: 0.6, y: 0.6 }, { x: 0.68, y: 0.32 }, { x: 0.76, y: 0.62 },
          { x: 0.84, y: 0.45 }, { x: 0.9, y: 0.55 },
        ];
        const abs = pts.map((p) => ({
          x: box.x + p.x * box.width,
          y: box.y + p.y * box.height,
        }));
        await page.mouse.move(abs[0].x, abs[0].y);
        await page.mouse.down();
        for (let i = 1; i < abs.length; i++) {
          await page.mouse.move(abs[i].x, abs[i].y, { steps: 6 });
          if (step.step_ms) await sleep(step.step_ms);
        }
        await page.mouse.up();
        break;
      }
    }
  }
}
