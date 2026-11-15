/**
 * Posts videos and photos to AlongXide TikTok.
 * Access token is refreshed in the GitHub Actions workflow before this runs.
 * Skips gracefully if TIKTOK_ACCESS_TOKEN is not set.
 */

import { readFileSync } from 'node:fs';

const API          = 'https://open.tiktokapis.com/v2';
const ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN;

function caption2200(text) {
  return text.slice(0, 2200);
}

async function waitForPublish(publishId) {
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const res = await fetch(`${API}/post/publish/status/fetch/`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const data   = await res.json();
    const status = data?.data?.status;
    if (status === 'PUBLISH_COMPLETE') return;
    if (status === 'FAILED' || (data.error?.code && data.error.code !== 'ok')) {
      throw new Error(`TikTok publish failed: ${JSON.stringify(data)}`);
    }
  }
  throw new Error('TikTok publish timed out after 80s');
}

export async function postTikTokVideo(videoPath, caption) {
  if (!ACCESS_TOKEN) { console.log('  TikTok: skipped (not configured)'); return; }

  const videoBytes = readFileSync(videoPath);
  const videoSize  = videoBytes.length;

  // Step 1: Initialize upload
  console.log('  TikTok: Initializing video upload...');
  const initRes  = await fetch(`${API}/post/publish/video/init/`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: {
        title:                    caption2200(caption),
        privacy_level:            'PUBLIC_TO_EVERYONE',
        disable_duet:             false,
        disable_comment:          false,
        disable_stitch:           false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source:            'FILE_UPLOAD',
        video_size:        videoSize,
        chunk_size:        videoSize,
        total_chunk_count: 1,
      },
    }),
  });
  const initData = await initRes.json();
  if (initData.error?.code !== 'ok') {
    throw new Error(`TikTok video init failed: ${JSON.stringify(initData.error)}`);
  }
  const { publish_id, upload_url } = initData.data;

  // Step 2: Upload video in one chunk
  console.log('  TikTok: Uploading video...');
  const uploadRes = await fetch(upload_url, {
    method: 'PUT',
    headers: {
      'Content-Range':  `bytes 0-${videoSize - 1}/${videoSize}`,
      'Content-Length': String(videoSize),
      'Content-Type':   'video/mp4',
    },
    body: videoBytes,
  });
  if (!uploadRes.ok) {
    throw new Error(`TikTok upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
  }

  // Step 3: Wait for TikTok to process and publish
  console.log('  TikTok: Waiting for publish...');
  await waitForPublish(publish_id);
  console.log(`  TikTok: Posted Video ✓  publish_id: ${publish_id}`);
}

export async function postTikTokPhoto(imageUrl, caption) {
  if (!ACCESS_TOKEN) { console.log('  TikTok: skipped (not configured)'); return; }

  console.log('  TikTok: Posting photo...');
  const initRes  = await fetch(`${API}/post/publish/content/init/`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: {
        title:           caption2200(caption),
        privacy_level:   'PUBLIC_TO_EVERYONE',
        disable_comment: false,
        auto_add_music:  true,
      },
      source_info: {
        source:            'PULL_FROM_URL',
        photo_images:      [imageUrl],
        photo_cover_index: 0,
      },
      post_mode:  'DIRECT_POST',
      media_type: 'PHOTO',
    }),
  });
  const initData = await initRes.json();
  if (initData.error?.code !== 'ok') {
    throw new Error(`TikTok photo init failed: ${JSON.stringify(initData.error)}`);
  }
  const { publish_id } = initData.data;

  await waitForPublish(publish_id);
  console.log(`  TikTok: Posted Photo ✓  publish_id: ${publish_id}`);
}
