// Visual gate: screenshot every screen of a piece and detect overflow.
// Run it BEFORE spending on TTS. Needs the screen server up and Playwright.
//
//   PORT=5599 npx tsx tools/serve-screens.ts &
//   node tools/gate-visual.mjs <id> <N> [width] [height]
//   node tools/gate-visual.mjs my-tutorial 12            # 1920x1080 default
//   node tools/gate-visual.mjs my-reel 8 1080 1920       # vertical
//
// PNGs land in /tmp/gate-<id>/ for an eyeball pass (palette, overlaps): the
// script catches overflow automatically, the rest you look at.
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
let chromium;
try {
  ({ chromium } = require('@playwright/test'));
} catch {
  try { ({ chromium } = require('playwright')); }
  catch { ({ chromium } = require('playwright-core')); }
}

const [id, nStr, wStr = '1920', hStr = '1080'] = process.argv.slice(2);
if (!id || !nStr) {
  console.error('usage: node gate-visual.mjs <id> <screen-count> [width] [height]');
  process.exit(1);
}
const n = Number(nStr), width = Number(wStr), height = Number(hStr);
const port = Number(process.env.PORT ?? 5599);
const out = `/tmp/gate-${id}`;
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height } });
const problems = [];

for (let i = 1; i <= n; i++) {
  await page.goto(`http://127.0.0.1:${port}/${id}/${i}.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${out}/${String(i).padStart(2, '0')}.png` });
  const r = await page.evaluate(() => {
    const s = document.querySelector('.screen');
    const overflows = s && (s.scrollHeight > s.clientHeight || s.scrollWidth > s.clientWidth);
    const clipped = [...document.querySelectorAll('.pane, .term, .phrase, pre')]
      .filter((e) => e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2)
      .map((e) => `${e.className || e.tagName} ${e.scrollHeight}>${e.clientHeight}`);
    return { overflows, clipped };
  });
  if (r.overflows || r.clipped.length) {
    problems.push(`${i}: ${r.overflows ? 'SCREEN OVERFLOWS ' : ''}${r.clipped.join(' | ')}`);
  }
}

await browser.close();
console.log(problems.length ? problems.join('\n') : 'no overflow');
console.log(`\nPNGs in ${out}/ — eyeball them: palette, color emojis, overlaps with the progress board`);
