/**
 * AlongXide Instagram Auto-Poster
 * 3 posts per day — morning Trial Reel, noon Feature Clip, evening Normal Reel.
 * Random-within-window timing via deterministic date-seeded slot selection.
 * Run by GitHub Actions at 4 slots per hour-window; 3 of 4 runs exit instantly.
 */

import { generateReel, generatePhoto } from './generate.mjs';
import { postReel, postPhoto }         from './instagram.mjs';
import { PROBLEMS, SOLUTIONS, FEATURES } from './generate/problems.mjs';

const LAUNCH_DATE = new Date('2026-12-04T00:00:00Z');
const START_DATE  = new Date('2026-11-14T00:00:00Z');

const HASHTAGS = '#AlongXide #BeninCity #Abuja #Nigeria #LaunchingSoon #December4';

const REEL_CAPTIONS = [
  `{problem}\n\nAlongXide fix: {solution}\n\n{days} days to December 4th.\n\n${HASHTAGS}`,
  `"{problem}"\n\nWe solve this.\n\n{solution}\n\n{days} days to go — December 4th.\n\n${HASHTAGS}`,
  `The problem: {problem}\n\nThe fix: {solution}\n\nAlongXide is coming. {days} days.\n\n${HASHTAGS}`,
  `Real Nigerian problem.\n\n"{problem}"\n\nAlongXide answer: {solution}\n\n{days} days left.\n\n${HASHTAGS}`,
];

const FEATURE_CAPTIONS = [
  `{title}.\n\n{desc}\n\nAlongXide. Coming December 4th. {days} days to go.\n\n${HASHTAGS}`,
  `Built this for you.\n\n{title}.\n\n{desc}\n\n{days} days to December 4th.\n\n${HASHTAGS}`,
];

function daysUntilLaunch() {
  return Math.max(0, Math.ceil((LAUNCH_DATE - new Date()) / (1000 * 60 * 60 * 24)));
}

function daysSinceStart() {
  return Math.floor((new Date() - START_DATE) / (1000 * 60 * 60 * 24));
}

// Deterministic pseudo-random slot: each day picks a different 15-min slot (0-3)
// within the posting window. Only the matching slot actually posts; others exit fast.
function isMySlot(windowName) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const seed    = `${windowName}-${dateStr}`;
  const hash    = [...seed].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const preferredSlot  = Math.abs(hash) % 4;
  const currentSlot    = Math.floor(new Date().getUTCMinutes() / 15);
  return preferredSlot === currentSlot;
}

async function main() {
  const now   = new Date();
  const force = (process.env.FORCE_POST || '').toLowerCase().trim();
  const hour  = force === 'morning'                        ? 7
              : (force === 'noon' || force === 'afternoon') ? 11
              : force === 'evening'                         ? 15
              : now.getUTCHours();
  const days = daysUntilLaunch();
  const dss  = daysSinceStart();

  if (force) console.log(`⚡ Force mode: ${force} (testing only)`);

  // ── Morning: 7:00-7:45 UTC (8:00-8:45 AM WAT) → Trial Reel ─────────────
  if (hour === 7) {
    if (!force && !isMySlot('morning')) { console.log('Not the morning slot today. Exiting.'); return; }

    const postNum = dss * 2;
    const problem  = PROBLEMS[postNum % PROBLEMS.length];
    const solution = SOLUTIONS[postNum % SOLUTIONS.length];
    const variant  = Math.floor(postNum / PROBLEMS.length) % REEL_CAPTIONS.length;
    const caption  = REEL_CAPTIONS[variant]
      .replace('{problem}', problem)
      .replace('{solution}', solution)
      .replace('{days}', days);

    console.log('=== AlongXide — Morning Reel (Trial) ===');
    console.log(`Days until launch : ${days}`);
    console.log(`Problem           : ${problem}`);
    console.log(`Solution          : ${solution}`);

    console.log('\n[1/2] Generating video...');
    const videoPath = await generateReel(problem, solution, days, postNum);

    console.log('\n[2/2] Posting as Trial Reel...');
    await postReel(videoPath, caption, true);

  // ── Noon: 11:00-11:45 UTC (12:00-12:45 PM WAT) → Feature Photo ─────────
  } else if (hour === 11) {
    if (!force && !isMySlot('noon')) { console.log('Not the noon slot today. Exiting.'); return; }

    const feature = FEATURES[dss % FEATURES.length];
    const variant = dss % FEATURE_CAPTIONS.length;
    const caption = FEATURE_CAPTIONS[variant]
      .replace('{title}', feature.title.replace('\n', ' '))
      .replace('{desc}', feature.desc)
      .replace('{days}', days);

    console.log('=== AlongXide — Noon Feature Photo ===');
    console.log(`Days until launch : ${days}`);
    console.log(`Feature           : ${feature.title.replace('\n', ' ')}`);

    console.log('\n[1/2] Generating photo...');
    const photoPath = await generatePhoto(feature.title, feature.desc, days, dss % FEATURES.length);

    console.log('\n[2/2] Posting as photo...');
    await postPhoto(photoPath, caption);

  // ── Evening: 15:00-15:45 UTC (4:00-4:45 PM WAT) → Normal Reel ──────────
  } else if (hour === 15) {
    if (!force && !isMySlot('evening')) { console.log('Not the evening slot today. Exiting.'); return; }

    const postNum  = dss * 2 + 1;
    const problem  = PROBLEMS[postNum % PROBLEMS.length];
    const solution = SOLUTIONS[postNum % SOLUTIONS.length];
    const variant  = Math.floor(postNum / PROBLEMS.length) % REEL_CAPTIONS.length;
    const caption  = REEL_CAPTIONS[variant]
      .replace('{problem}', problem)
      .replace('{solution}', solution)
      .replace('{days}', days);

    console.log('=== AlongXide — Evening Reel (Normal) ===');
    console.log(`Days until launch : ${days}`);
    console.log(`Problem           : ${problem}`);
    console.log(`Solution          : ${solution}`);

    console.log('\n[1/2] Generating video...');
    const videoPath = await generateReel(problem, solution, days, postNum);

    console.log('\n[2/2] Posting as Regular Reel...');
    await postReel(videoPath, caption, false);

  } else {
    console.log('Outside posting windows (7, 11, 15 UTC). Exiting.');
    return;
  }

  console.log('\nDone! 🚀');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
