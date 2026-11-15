/**
 * Generates AlongXide reels and feature clips as reel.mp4.
 * Exports: generateReel(problem, solution, days, postIndex)
 *          generateFeature(title, desc, postIndex)
 */

import http from 'node:http';
import path from 'node:path';
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const here        = path.dirname(fileURLToPath(import.meta.url));
const GENERATE_DIR = path.join(here, 'generate');
const FRAMES_DIR  = path.join(here, '.frames');
const OUTPUT_PATH = path.join(here, 'reel.mp4');
const AUDIO_PATH  = path.join(here, 'audio.aac');

const FPS            = 30;
const REEL_DURATION  = 15;
const REEL_FRAMES    = FPS * REEL_DURATION;   // 450
const FEAT_DURATION  = 5;
const FEAT_FRAMES    = FPS * FEAT_DURATION;   // 150

const SOUNDS_DIR = path.join(here, 'sounds');

// Returns a real sound file path if sounds/ folder has audio files, otherwise null
function pickSoundFile(postIndex) {
  if (!existsSync(SOUNDS_DIR)) return null;
  const files = readdirSync(SOUNDS_DIR).filter(f => /\.(mp3|wav|aac|m4a|ogg)$/i.test(f)).sort();
  if (!files.length) return null;
  return path.join(SOUNDS_DIR, files[postIndex % files.length]);
}

const MIME = {
  '.html': 'text/html',  '.js': 'text/javascript',  '.mjs': 'text/javascript',
  '.css': 'text/css',    '.png': 'image/png',         '.woff2': 'font/woff2',
};

// ── 7 cinematic noise-based audio patterns ───────────────────────────────────
// Each blends: sub-bass heartbeat + mid tension texture + shimmer on reveal
const AUDIO_PATTERNS = [
  // 0: Dramatic — deep sub-bass, slow 1.5-beat heartbeat
  { bassFreq: 70,  pulseHz: 1.5, pulseDep: 0.65, bassVol: 0.55,
    midFreq: 320,  midBw: 400, midVol: 0.40, shimFreq: 5000, shimVol: 0.30 },
  // 1: Energetic — punchy bass, fast 4-beat, bright shimmer
  { bassFreq: 90,  pulseHz: 4.0, pulseDep: 0.55, bassVol: 0.50,
    midFreq: 520,  midBw: 600, midVol: 0.38, shimFreq: 6500, shimVol: 0.42 },
  // 2: Countdown — steady 2-beat, medium warmth
  { bassFreq: 80,  pulseHz: 2.0, pulseDep: 0.60, bassVol: 0.52,
    midFreq: 420,  midBw: 500, midVol: 0.38, shimFreq: 5500, shimVol: 0.35 },
  // 3: Upbeat — 3-beat, brighter mid
  { bassFreq: 85,  pulseHz: 3.0, pulseDep: 0.50, bassVol: 0.48,
    midFreq: 600,  midBw: 700, midVol: 0.42, shimFreq: 7000, shimVol: 0.42 },
  // 4: Mysterious — very slow 1-beat, very deep bass
  { bassFreq: 55,  pulseHz: 1.0, pulseDep: 0.72, bassVol: 0.58,
    midFreq: 220,  midBw: 320, midVol: 0.32, shimFreq: 4000, shimVol: 0.25 },
  // 5: Funky — syncopated 3.5-beat, mid-heavy
  { bassFreq: 95,  pulseHz: 3.5, pulseDep: 0.58, bassVol: 0.50,
    midFreq: 560,  midBw: 650, midVol: 0.40, shimFreq: 6000, shimVol: 0.38 },
  // 6: Minimal — clean 2.5-beat, light shimmer
  { bassFreq: 75,  pulseHz: 2.5, pulseDep: 0.45, bassVol: 0.44,
    midFreq: 360,  midBw: 460, midVol: 0.30, shimFreq: 5200, shimVol: 0.28 },
];

async function generateAudio(postIndex, duration = REEL_DURATION) {
  // Use a real sound file from sounds/ if one exists (best quality)
  const soundFile = pickSoundFile(postIndex);
  if (soundFile) {
    console.log(`  Using sound file: ${path.basename(soundFile)}`);
    await runFfmpeg([
      '-stream_loop', '-1', '-i', soundFile,
      '-t', String(duration),
      '-af', `afade=in:st=0:d=0.5,afade=out:st=${duration - 1.5}:d=1.5`,
      '-ac', '2', '-c:a', 'aac', '-b:a', '128k', '-y', AUDIO_PATH,
    ]);
    return;
  }

  // Fallback: synthesize cinematic noise-based audio
  const p   = AUDIO_PATTERNS[postIndex % AUDIO_PATTERNS.length];
  const dur = duration + 1;

  // Shimmer kicks in at 80% through the video (logo/brand reveal moment)
  const shimStart = (duration * 0.80).toFixed(1);

  // ffmpeg aeval commas break filter chain parsing — use arithmetic min/max instead:
  // min(a,b) = (a+b-abs(a-b))/2   max(a,b) = (a+b+abs(a-b))/2
  const fmin = (a, b) => `(${a}+${b}-abs(${a}-${b}))/2`;
  const fmax = (a, b) => `(${a}+${b}+abs(${a}-${b}))/2`;

  // Bass: low-pass brown noise with rhythmic amplitude modulation (the "heartbeat")
  const bassEnv    = `${(1 - p.pulseDep).toFixed(2)}+${p.pulseDep.toFixed(2)}*abs(sin(2*PI*${p.pulseHz}*t))`;
  const bassFilter = `[0]lowpass=f=${p.bassFreq},aeval=val(0)*(${bassEnv}),volume=${p.bassVol.toFixed(2)}[bass]`;

  // Mid tension: bandpass pink noise that builds from silence over first 7 seconds
  const midRamp   = fmin('t/7', '1');
  const midFilter = `[1]bandpass=f=${p.midFreq}:width_type=h:w=${p.midBw},aeval=val(0)*${p.midVol.toFixed(2)}*${midRamp}[mid]`;

  // Shimmer: narrow high-band white noise, emerges at logo reveal
  const shimMax     = Math.min(p.shimFreq * 2, 20000);
  const shimRaw     = fmax(`t-${shimStart}`, '0');
  const shimClamped = fmin(`${shimRaw}/2`, '1');
  const shimFilter  = `[2]highpass=f=${p.shimFreq},lowpass=f=${shimMax},aeval=val(0)*${p.shimVol.toFixed(2)}*(0.08+0.92*${shimClamped})[shim]`;

  const filterGraph = [
    bassFilter, midFilter, shimFilter,
    `[bass][mid][shim]amix=inputs=3[mix]`,
    `[mix]afade=in:st=0:d=0.5,afade=out:st=${dur - 1.5}:d=1.5[out]`,
  ].join(';');

  await runFfmpeg([
    '-f', 'lavfi', '-i', `anoisesrc=c=brown:a=1.0:d=${dur}`,
    '-f', 'lavfi', '-i', `anoisesrc=c=pink:a=1.0:d=${dur}`,
    '-f', 'lavfi', '-i', `anoisesrc=c=white:a=1.0:d=${dur}`,
    '-filter_complex', filterGraph,
    '-map', '[out]',
    '-ac', '2', '-c:a', 'aac', '-b:a', '128k', '-y', AUDIO_PATH,
  ]);
}

function makeServer() {
  const server = http.createServer((req, res) => {
    const url  = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(GENERATE_DIR, url === '/' ? 'reel.html' : url);
    if (existsSync(file) && !file.includes('..')) {
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      res.end(readFileSync(file));
    } else { res.writeHead(404); res.end(); }
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function makeBrowser() {
  return puppeteer.launch({
    headless: true,
    protocolTimeout: 300_000,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
      '--hide-scrollbars', '--force-color-profile=srgb',
      '--font-render-hinting=none', '--run-all-compositor-stages-before-draw',
    ],
  });
}

async function renderFrames(page, totalFrames) {
  if (existsSync(FRAMES_DIR)) rmSync(FRAMES_DIR, { recursive: true });
  mkdirSync(FRAMES_DIR);
  for (let f = 0; f < totalFrames; f++) {
    const ms = (f / FPS) * 1000;
    await page.evaluate(ms => { window.seek(ms); return new Promise(requestAnimationFrame); }, ms);
    await page.screenshot({
      path: path.join(FRAMES_DIR, `${String(f).padStart(4, '0')}.png`),
      omitBackground: false, timeout: 60_000,
    });
    if (f % 30 === 0) process.stdout.write(`\r  Rendering: ${f}/${totalFrames} frames`);
  }
  process.stdout.write(`\r  Rendering: ${totalFrames}/${totalFrames} frames ✓\n`);
}

async function stitchVideo() {
  await runFfmpeg([
    '-framerate', String(FPS),
    '-i', path.join(FRAMES_DIR, '%04d.png'),
    '-i', AUDIO_PATH,
    '-vf', 'format=yuv420p',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '128k', '-shortest',
    '-profile:v', 'high', '-movflags', '+faststart',
    '-y', OUTPUT_PATH,
  ]);
  rmSync(FRAMES_DIR, { recursive: true });
  if (existsSync(AUDIO_PATH)) rmSync(AUDIO_PATH);
}

// ── Exported: countdown reel (problem → solution → countdown → brand) ────────
export async function generateReel(problemText, solutionText, daysUntilLaunch, postIndex = 0) {
  const server  = await makeServer();
  const { port } = server.address();
  const browser = await makeBrowser();
  const page    = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

  const params = new URLSearchParams({
    problem:  problemText,
    solution: solutionText,
    days:     String(daysUntilLaunch),
  });
  await page.goto(`http://127.0.0.1:${port}/?${params}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.__ready);
  await new Promise(r => setTimeout(r, 1500));

  await renderFrames(page, REEL_FRAMES);
  await browser.close();
  server.close();

  console.log(`  Generating audio (pattern ${postIndex % AUDIO_PATTERNS.length})...`);
  await generateAudio(postIndex, REEL_DURATION);

  console.log('  Stitching video...');
  await stitchVideo();
  console.log('  Video ready: reel.mp4');
  return OUTPUT_PATH;
}

// ── Exported: feature highlight clip (noon post) ─────────────────────────────
export async function generateFeature(featureTitle, featureDesc, postIndex = 0) {
  const server  = await makeServer();
  const { port } = server.address();
  const browser = await makeBrowser();
  const page    = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

  const params = new URLSearchParams({ title: featureTitle, desc: featureDesc });
  await page.goto(`http://127.0.0.1:${port}/feature.html?${params}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.__ready);
  await new Promise(r => setTimeout(r, 1500));

  await renderFrames(page, FEAT_FRAMES);
  await browser.close();
  server.close();

  console.log(`  Generating audio (pattern ${postIndex % AUDIO_PATTERNS.length})...`);
  await generateAudio(postIndex, FEAT_DURATION);

  console.log('  Stitching video...');
  await stitchVideo();
  console.log('  Feature clip ready: reel.mp4');
  return OUTPUT_PATH;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
  });
}
