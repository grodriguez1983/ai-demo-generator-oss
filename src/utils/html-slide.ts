import { chromium } from '@playwright/test';
import { createLogger } from './logger.js';
import { getVideoDuration, linearNormalizationGainDb } from './ffmpeg.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  VIDEO_CODEC,
  VIDEO_PRESET,
  VIDEO_CRF,
  AUDIO_CODEC,
} from '../config/constants.js';

const execFileAsync = promisify(execFile);
const log = createLogger('html-slide');

/** Shield logo SVG (white, no background) for use on gradient slides */
const SHIELD_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 32 32" fill="none">
  <path d="M16 4C16 4 6 7 6 14C6 21 11 26 16 28C21 26 26 21 26 14C26 7 16 4 16 4Z" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M11 15L14.5 18.5L21 11" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export interface BrandedSlideConfig {
  width: number;
  height: number;
  durationSec: number;
  brandName?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  items?: string[];
  audioPath?: string;
  /** SVG inline para el logo (reemplaza el escudo default). */
  logoSvg?: string;
  /** CSS de background del slide (reemplaza el gradiente azul default). */
  bgGradient?: string;
}

/** Generate a branded PNG from HTML (gradient bg, logo, Inter font) */
export async function generateBrandedPng(
  outputPath: string,
  config: Omit<BrandedSlideConfig, 'durationSec' | 'audioPath'>,
): Promise<void> {
  const {
    width,
    height,
    brandName = 'My Product',
    eyebrow,
    title,
    description,
    items = [],
    logoSvg,
    bgGradient,
  } = config;

  log.info(`Generating branded PNG: "${title.slice(0, 40)}..." → ${outputPath}`);

  // Scale factors based on width (reference: 1080px)
  const s = width / 1080;

  const itemsHtml = items
    .map(
      (text, i) => `
      <div class="item">
        <div class="item-number">${i + 1}</div>
        <div class="item-text">${text}</div>
      </div>`,
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${width}px;
      height: ${height}px;
      background: ${bgGradient ?? 'linear-gradient(155deg, #1565C0 0%, #1976D2 30%, #2196F3 55%, #00ACC1 80%, #00BCD4 100%)'};
      font-family: 'Inter', sans-serif;
      color: white;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: ${Math.round(80 * s)}px ${Math.round(72 * s)}px;
      overflow: hidden;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: ${Math.round(18 * s)}px;
      margin-bottom: ${Math.round(48 * s)}px;
    }
    .brand svg {
      width: ${Math.round(52 * s)}px;
      height: ${Math.round(52 * s)}px;
    }
    .brand-name {
      font-size: ${Math.round(30 * s)}px;
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    .eyebrow {
      display: inline-block;
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.18);
      border: ${Math.round(2 * s)}px solid rgba(255, 255, 255, 0.35);
      border-radius: ${Math.round(999 * s)}px;
      padding: ${Math.round(12 * s)}px ${Math.round(26 * s)}px;
      font-size: ${Math.round(24 * s)}px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: ${Math.round(28 * s)}px;
    }
    .title {
      font-size: ${Math.round(56 * s)}px;
      font-weight: 800;
      line-height: 1.15;
      margin-bottom: ${Math.round(32 * s)}px;
    }
    .description {
      font-size: ${Math.round(28 * s)}px;
      font-weight: 400;
      line-height: 1.55;
      opacity: 0.92;
      margin-bottom: ${Math.round(56 * s)}px;
    }
    .items {
      display: flex;
      flex-direction: column;
      gap: ${Math.round(28 * s)}px;
    }
    .item {
      display: flex;
      align-items: center;
      gap: ${Math.round(20 * s)}px;
    }
    .item-number {
      width: ${Math.round(48 * s)}px;
      height: ${Math.round(48 * s)}px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${Math.round(22 * s)}px;
      font-weight: 600;
      flex-shrink: 0;
    }
    .item-text {
      font-size: ${Math.round(26 * s)}px;
      font-weight: 400;
      opacity: 0.95;
    }
    .brand svg { height: ${Math.round(30 * s)}px; width: auto; }
  </style>
</head>
<body>
  <div class="brand">
    ${logoSvg ?? SHIELD_LOGO_SVG}
    ${brandName ? `<span class="brand-name">${brandName}</span>` : ''}
  </div>
  ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
  <div class="title">${title}</div>
  ${description ? `<div class="description">${description}</div>` : ''}
  ${items.length > 0 ? `<div class="items">${itemsHtml}</div>` : ''}
</body>
</html>`;

  await renderHtmlToPng(html, outputPath, width, height);
  log.info(`Rendered branded PNG: ${outputPath}`);
}

/** Render an HTML string to PNG with Playwright */
async function renderHtmlToPng(
  html: string,
  outputPath: string,
  width: number,
  height: number,
): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  // Small delay for font loading
  await page.waitForTimeout(500);
  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();
}

/** Convert a still PNG + optional narration audio into a slide video */
async function pngToSlideVideo(
  pngPath: string,
  outputPath: string,
  durationSec: number,
  audioPath?: string,
): Promise<number> {
  // Determine duration from audio if provided
  let dur = durationSec;
  if (audioPath) {
    const audioDur = await getVideoDuration(audioPath);
    if (audioDur > 0) {
      dur = audioDur + 0.5;
      log.info(`Slide duration from audio: ${dur.toFixed(1)}s`);
    }
  }

  const args = [
    '-y',
    '-loop', '1',
    '-i', pngPath,
  ];

  if (audioPath) {
    args.push('-i', audioPath);
    // Ganancia lineal a -16 LUFS (dos pasadas), igual que la narración del
    // contenido: mismo target y mismo método para que no haya salto de nivel
    // entre el hook y las frases que siguen.
    const gain = await linearNormalizationGainDb(audioPath);
    args.push('-af', `volume=${gain.toFixed(2)}dB,aresample=44100`);
  } else {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
  }

  args.push(
    '-c:v', VIDEO_CODEC,
    '-preset', VIDEO_PRESET,
    '-crf', String(VIDEO_CRF),
    '-pix_fmt', 'yuv420p',
    '-c:a', AUDIO_CODEC,
    '-t', String(dur),
    '-shortest',
    outputPath,
  );

  await execFileAsync('ffmpeg', args, { maxBuffer: 50 * 1024 * 1024 });
  return dur;
}

/** Generate a branded slide video from HTML (gradient bg, logo, Inter font) */
export async function generateBrandedSlide(
  outputPath: string,
  config: BrandedSlideConfig,
): Promise<void> {
  const { width, height, title } = config;

  log.info(`Generating branded slide: "${title.slice(0, 40)}..." → ${outputPath}`);

  const pngPath = outputPath.replace(/\.mp4$/, '.png');
  await generateBrandedPng(pngPath, config);
  await pngToSlideVideo(pngPath, outputPath, config.durationSec, config.audioPath);
  log.info(`Branded slide video: ${outputPath}`);
}

export interface PainHookMessage {
  from?: string;
  text: string;
  time?: string;
  out?: boolean;
}

export interface PainHookSlideConfig {
  width: number;
  height: number;
  durationSec: number;
  /** Big pain statement overlaid on the chat (≤8 palabras idealmente) */
  overlayText: string;
  chatTitle?: string;
  messages: PainHookMessage[];
  audioPath?: string;
}

/** Sender-name palette for incoming group-chat bubbles (WhatsApp-style) */
const CHAT_SENDER_COLORS = ['#53bdeb', '#f5a623', '#e17076', '#7bc862'];

/**
 * Generate a "pain hook" slide: WhatsApp-style chat mockup with a big pain
 * statement overlaid. Deliberately unbranded — no logo, no gradient — so the
 * first frames mirror the viewer's problem instead of looking like an ad.
 */
export async function generatePainHookSlide(
  outputPath: string,
  config: PainHookSlideConfig,
): Promise<void> {
  const { width, height, overlayText, chatTitle = 'Cuadrilla — Obra', messages } = config;

  log.info(`Generating pain-hook slide: "${overlayText.slice(0, 40)}" → ${outputPath}`);

  // Scale factors based on width (reference: 1080px)
  const s = width / 1080;

  const senderColor = (name: string): string => {
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return CHAT_SENDER_COLORS[Math.abs(hash) % CHAT_SENDER_COLORS.length];
  };

  const messagesHtml = messages
    .map((msg) => {
      const fromHtml = !msg.out && msg.from
        ? `<div class="msg-from" style="color:${senderColor(msg.from)}">${msg.from}</div>`
        : '';
      const ticks = msg.out
        ? `<span class="ticks">✓✓</span>`
        : '';
      return `
      <div class="msg ${msg.out ? 'out' : 'in'}">
        ${fromHtml}
        <div class="msg-text">${msg.text}</div>
        <div class="msg-meta">${msg.time ?? ''}${ticks}</div>
      </div>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${width}px;
      height: ${height}px;
      background: #0b141a;
      font-family: 'Inter', sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }
    .chat-header {
      display: flex;
      align-items: center;
      gap: ${Math.round(24 * s)}px;
      background: #202c33;
      padding: ${Math.round(28 * s)}px ${Math.round(36 * s)}px;
    }
    .avatar {
      width: ${Math.round(84 * s)}px;
      height: ${Math.round(84 * s)}px;
      border-radius: 50%;
      background: #6a7175;
      color: #cfd8dc;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${Math.round(36 * s)}px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .chat-title { color: #e9edef; font-size: ${Math.round(34 * s)}px; font-weight: 600; }
    .chat-sub { color: #8696a0; font-size: ${Math.round(24 * s)}px; margin-top: ${Math.round(4 * s)}px; }
    .chat-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: ${Math.round(22 * s)}px;
      padding: ${Math.round(48 * s)}px ${Math.round(40 * s)}px;
      /* Center the bubbles between the header and the overlay statement */
      padding-bottom: ${Math.round(height * 0.42)}px;
    }
    .day-pill {
      align-self: center;
      background: #182229;
      color: #8696a0;
      font-size: ${Math.round(22 * s)}px;
      font-weight: 500;
      border-radius: ${Math.round(10 * s)}px;
      padding: ${Math.round(10 * s)}px ${Math.round(22 * s)}px;
      margin-bottom: ${Math.round(14 * s)}px;
    }
    .msg {
      max-width: 78%;
      border-radius: ${Math.round(16 * s)}px;
      padding: ${Math.round(18 * s)}px ${Math.round(24 * s)}px;
      font-size: ${Math.round(30 * s)}px;
      line-height: 1.4;
    }
    .msg.in { background: #202c33; color: #e9edef; align-self: flex-start; border-top-left-radius: ${Math.round(4 * s)}px; }
    .msg.out { background: #005c4b; color: #e9edef; align-self: flex-end; border-top-right-radius: ${Math.round(4 * s)}px; }
    .msg-from { font-size: ${Math.round(24 * s)}px; font-weight: 600; margin-bottom: ${Math.round(6 * s)}px; }
    .msg-meta {
      color: rgba(233, 237, 239, 0.6);
      font-size: ${Math.round(20 * s)}px;
      text-align: right;
      margin-top: ${Math.round(8 * s)}px;
      display: flex;
      justify-content: flex-end;
      gap: ${Math.round(8 * s)}px;
    }
    .ticks { color: #53bdeb; }
    .overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(11, 20, 26, 0) 30%, rgba(11, 20, 26, 0.82) 62%, rgba(11, 20, 26, 0.92) 100%);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      /* Keep the statement above the ~360px reserved by IG reels UI at 1920px height */
      padding: 0 ${Math.round(64 * s)}px ${Math.round(height * 0.26)}px;
    }
    .overlay-text {
      color: #ffffff;
      font-size: ${Math.round(88 * s)}px;
      font-weight: 900;
      line-height: 1.12;
      text-align: center;
      letter-spacing: -0.01em;
      text-shadow: 0 ${Math.round(6 * s)}px ${Math.round(28 * s)}px rgba(0, 0, 0, 0.55);
    }
  </style>
</head>
<body>
  <div class="chat-header">
    <div class="avatar">${chatTitle.trim().slice(0, 1).toUpperCase()}</div>
    <div>
      <div class="chat-title">${chatTitle}</div>
      <div class="chat-sub">en línea</div>
    </div>
  </div>
  <div class="chat-body">
    <div class="day-pill">Hoy</div>
    ${messagesHtml}
  </div>
  <div class="overlay">
    <div class="overlay-text">${overlayText}</div>
  </div>
</body>
</html>`;

  const pngPath = outputPath.replace(/\.mp4$/, '.png');
  await renderHtmlToPng(html, pngPath, width, height);
  log.info(`Rendered pain-hook PNG: ${pngPath}`);
  await pngToSlideVideo(pngPath, outputPath, config.durationSec, config.audioPath);
  log.info(`Pain-hook slide video: ${outputPath}`);
}
