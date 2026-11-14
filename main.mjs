/**
 * AlongXide Instagram Reel Auto-Poster
 * Generates a fresh countdown reel and posts it to Instagram.
 * Run twice daily by GitHub Actions (09:00 and 19:00 WAT).
 */

import { generateReel } from './generate.mjs';
import { postReel }     from './instagram.mjs';
import { PROBLEMS }     from './generate/problems.mjs';

const LAUNCH_DATE = new Date('2026-12-04T00:00:00Z');
const START_DATE  = new Date('2026-11-14T00:00:00Z');

const HASHTAGS = '#AlongXide #BeninCity #Abuja #Nigeria #LaunchingSoon #December4';

// ── Captions for each problem (4 variants, picked by rotation) ──────────
// Template strings: {days} and {problem} are interpolated at runtime.
const CAPTION_TEMPLATES = [
  `{problem}\n\nAlongXide is solving this. {days} days to go.\n\n${HASHTAGS}`,
  `{days} days.\n\nThe problem: {problem}\n\nWe built the fix. December 4th.\n\n${HASHTAGS}`,
  `Real problem. Real solution.\n\n"{problem}"\n\nNot after December 4th. {days} days.\n\n${HASHTAGS}`,
  `The city has everything you need.\nAlongXide makes it reachable.\n\n{days} days.\n\n${HASHTAGS}`,
];

function daysUntilLaunch() {
  const now    = new Date();
  const diff   = LAUNCH_DATE - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getPostSlot() {
  const now             = new Date();
  const daysSinceStart  = Math.floor((now - START_DATE) / (1000 * 60 * 60 * 24));
  const isEvening       = now.getUTCHours() >= 14;   // 14:00 UTC = 15:00 WAT+1
  const postNumber      = daysSinceStart * 2 + (isEvening ? 1 : 0);
  const problemIndex    = postNumber % PROBLEMS.length;
  const captionVariant  = Math.floor(postNumber / PROBLEMS.length) % CAPTION_TEMPLATES.length;
  return { problemIndex, captionVariant };
}

async function main() {
  const days = daysUntilLaunch();
  const { problemIndex, captionVariant } = getPostSlot();
  const problem = PROBLEMS[problemIndex];

  console.log('=== AlongXide Reel Generator ===');
  console.log(`Days until launch : ${days}`);
  console.log(`Problem #${problemIndex}       : ${problem}`);
  console.log(`Caption variant   : ${captionVariant}`);

  const caption = CAPTION_TEMPLATES[captionVariant]
    .replace('{days}',    days)
    .replace('{problem}', problem);

  // Generate the video
  console.log('\n[1/2] Generating video...');
  const videoPath = await generateReel(problem, days);

  // Post to Instagram
  console.log('\n[2/2] Posting to Instagram...');
  await postReel(videoPath, caption);

  console.log('\nDone! 🚀');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
