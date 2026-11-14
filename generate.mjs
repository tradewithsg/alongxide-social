/**
 * Generates one AlongXide countdown reel as reel.mp4.
 * Usage: node generate.mjs <problem_text> <days_until_launch>
 * Called by main.mjs — not run directly in production.
 */

import http from 'node:http';
import path from 'node:path';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const here = path.dirname(fileURLToPath(import.meta.url));
const GENERATE_DIR = path.join(here, 'generate');
const FRAMES_DIR   = path.join(here, '.frames');
const OUTPUT_PATH  = path.join(here, 'reel.mp4');

const FPS       = 30;
const DURATION  = 15;        // seconds
const FRAMES    = FPS * DURATION;  // 450

// 7 synthesised audio moods — picked by post index, generated fresh each run via ffmpeg
const AUDIO_PATTERNS = [
  // 0 Dramatic: deep A bass with slow heartbeat pulse
  { freqs: [110, 165, 220],      vols: [0.40, 0.20, 0.08], hz: 1.5, depth: 0.70 },
  // 1 Energetic: D major chord stack, fast 4-beat pulse
  { freqs: [220, 277, 330, 440], vols: [0.30, 0.18, 0.12, 0.08], hz: 4.0, depth: 0.50 },
  // 2 Countdown: G major, steady 2-beat
  { freqs: [196, 247, 294],      vols: [0.35, 0.20, 0.10], hz: 2.0, depth: 0.60 },
  // 3 Upbeat: C major, bright 3-beat
  { freqs: [261, 329, 392],      vols: [0.28, 0.20, 0.15], hz: 3.0, depth: 0.45 },
  // 4 Mysterious: open fifths, very slow throb
  { freqs: [146, 219, 293],      vols: [0.38, 0.18, 0.08], hz: 1.0, depth: 0.75 },
  // 5 Funky: G octave stack, syncopated 3.5-beat
  { freqs: [196, 392, 588],      vols: [0.32, 0.20, 0.10], hz: 3.5, depth: 0.55 },
  // 6 Minimal: clean E-B fifth, medium pulse
  { freqs: [164, 247],           vols: [0.40, 0.25],       hz: 2.5, depth: 0.50 },
];

async function generateAudio(postIndex, outputPath) {
  const p   = AUDIO_PATTERNS[postIndex % AUDIO_PATTERNS.length];
  const dur = DURATION + 1;
  const terms = p.freqs.map((f, i) => `${p.vols[i]}*sin(2*PI*${f}*t)`).join('+');
  await runFfmpeg([
    '-f', 'lavfi', '-i', `aevalsrc='${terms}':s=44100:d=${dur}`,
    '-af', `atremolo=f=${p.hz}:d=${p.depth},afade=in:st=0:d=0.5,afade=out:st=${dur - 1.5}:d=1.5`,
    '-c:a', 'aac', '-b:a', '128k', '-y', outputPath,
  ]);
}

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.woff2':'font/woff2',
};

export async function generateReel(problemText, daysUntilLaunch, postIndex = 0) {
  // ── Local HTTP server to serve the generate/ folder ──────────────────
  const server = http.createServer((req, res) => {
    const url  = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(GENERATE_DIR, url === '/' ? 'reel.html' : url);
    if (existsSync(file) && !file.includes('..')) {
      const ext  = path.extname(file);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      res.end(readFileSync(file));
    } else {
      res.writeHead(404); res.end();
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();

  // ── Launch Puppeteer ──────────────────────────────────────────────────
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 120_000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--run-all-compositor-stages-before-draw',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

  const params = new URLSearchParams({
    problem: problemText,
    days:    String(daysUntilLaunch),
  });
  await page.goto(`http://127.0.0.1:${port}/?${params}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.__ready);

  // ── Render frames ─────────────────────────────────────────────────────
  if (existsSync(FRAMES_DIR)) rmSync(FRAMES_DIR, { recursive: true });
  mkdirSync(FRAMES_DIR);

  for (let f = 0; f < FRAMES; f++) {
    const ms = (f / FPS) * 1000;
    await page.evaluate(ms => {
      window.seek(ms);
      return new Promise(requestAnimationFrame);
    }, ms);
    await page.screenshot({
      path: path.join(FRAMES_DIR, `${String(f).padStart(4, '0')}.png`),
      omitBackground: false,
    });
    if (f % 30 === 0) process.stdout.write(`\r  Rendering: ${f}/${FRAMES} frames`);
  }
  process.stdout.write(`\r  Rendering: ${FRAMES}/${FRAMES} frames ✓\n`);

  await browser.close();
  server.close();

  // ── Generate audio ────────────────────────────────────────────────────
  const AUDIO_PATH = path.join(here, 'audio.aac');
  console.log(`  Generating audio (pattern ${postIndex % AUDIO_PATTERNS.length})...`);
  await generateAudio(postIndex, AUDIO_PATH);

  // ── Stitch frames + audio into MP4 ───────────────────────────────────
  console.log('  Stitching video...');
  await runFfmpeg([
    '-framerate', String(FPS),
    '-i', path.join(FRAMES_DIR, '%04d.png'),
    '-i', AUDIO_PATH,
    '-vf', 'format=yuv420p',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-profile:v', 'high',
    '-movflags', '+faststart',
    '-y', OUTPUT_PATH,
  ]);

  rmSync(FRAMES_DIR, { recursive: true });
  if (existsSync(AUDIO_PATH)) rmSync(AUDIO_PATH);
  console.log(`  Video ready: reel.mp4`);
  return OUTPUT_PATH;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
  });
}

// Allow running standalone for testing:
// node generate.mjs "Your runner took your money. And left." 20
if (process.argv[2]) {
  const problem = process.argv[2];
  const days    = parseInt(process.argv[3] ?? '20');
  generateReel(problem, days).catch(err => { console.error(err); process.exit(1); });
}
