/**
 * Posts Reels and Photos to the AlongXide Facebook Page.
 * Uses the same Meta System User token as Instagram.
 * Skips gracefully if FB_PAGE_ID is not set.
 */

import { readFileSync } from 'node:fs';

const API          = 'https://graph.facebook.com/v21.0';
const PAGE_ID      = process.env.FB_PAGE_ID;
const ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;

export async function postFacebookReel(videoPath, caption) {
  if (!PAGE_ID) { console.log('  Facebook: skipped (FB_PAGE_ID not set)'); return; }

  const videoBytes = readFileSync(videoPath);
  const videoSize  = videoBytes.length;

  // Step 1: Initialize reel upload
  console.log('  FB: Initializing reel upload...');
  const initRes  = await fetch(`${API}/${PAGE_ID}/video_reels`, {
    method: 'POST',
    body: new URLSearchParams({ upload_phase: 'start', access_token: ACCESS_TOKEN }),
  });
  const initData = await initRes.json();
  if (initData.error || !initData.video_id) {
    throw new Error(`FB reel init failed: ${JSON.stringify(initData.error || initData)}`);
  }
  const { video_id, upload_url } = initData;

  // Step 2: Upload video binary
  console.log('  FB: Uploading video...');
  const uploadRes = await fetch(upload_url, {
    method: 'POST',
    headers: {
      'Authorization': `OAuth ${ACCESS_TOKEN}`,
      'offset':        '0',
      'file_size':     String(videoSize),
      'Content-Type':  'application/octet-stream',
    },
    body: videoBytes,
  });
  if (!uploadRes.ok) {
    throw new Error(`FB video upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
  }

  // Step 3: Publish reel
  console.log('  FB: Publishing reel...');
  const pubRes  = await fetch(`${API}/${PAGE_ID}/video_reels`, {
    method: 'POST',
    body: new URLSearchParams({
      upload_phase: 'finish',
      video_id,
      video_state:  'REELS_READY',
      description:  caption,
      access_token: ACCESS_TOKEN,
    }),
  });
  const pubData = await pubRes.json();
  if (pubData.error) throw new Error(`FB publish failed: ${JSON.stringify(pubData.error)}`);

  console.log(`  FB: Posted Reel ✓  ID: ${pubData.post_id || pubData.id || video_id}`);
}

export async function postFacebookPhoto(imageUrl, caption) {
  if (!PAGE_ID) { console.log('  Facebook: skipped (FB_PAGE_ID not set)'); return; }

  console.log('  FB: Posting photo...');
  const res  = await fetch(`${API}/${PAGE_ID}/photos`, {
    method: 'POST',
    body: new URLSearchParams({ url: imageUrl, message: caption, access_token: ACCESS_TOKEN }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`FB photo failed: ${JSON.stringify(data.error)}`);

  console.log(`  FB: Posted Photo ✓  ID: ${data.id}`);
}
