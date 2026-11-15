/**
 * Posts a Reel to Instagram via the Graph API.
 * Tries Trial Reel first; falls back to regular Reel.
 */

import { readFileSync } from 'node:fs';

const IG_USER_ID    = process.env.IG_USER_ID;
const ACCESS_TOKEN  = process.env.IG_ACCESS_TOKEN;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
// Business Manager System User tokens work with graph.facebook.com (Instagram Graph API)
const API          = 'https://graph.facebook.com/v21.0';

async function initContainer(caption, trialReel = false) {
  const body = new URLSearchParams({
    media_type:   'REELS',
    upload_type:  'resumable',
    caption,
    access_token: ACCESS_TOKEN,
    ...(trialReel ? { is_trial_reel: 'true' } : {}),
  });
  const res = await fetch(`${API}/${IG_USER_ID}/media`, {
    method: 'POST',
    body,
  });
  const data = await res.json();
  if (!res.ok || !data.uri) throw Object.assign(new Error('Container init failed'), { data });
  return { id: data.id, uri: data.uri };
}

async function uploadVideo(uri, videoPath) {
  const buffer = readFileSync(videoPath);
  const size   = buffer.length;
  const res = await fetch(uri, {
    method: 'POST',
    headers: {
      Authorization:    `OAuth ${ACCESS_TOKEN}`,
      offset:           '0',
      file_size:        String(size),
      'X-Entity-Length': String(size),
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed ${res.status}: ${text}`);
  }
}

async function waitForContainer(id, maxWaitMs = 300_000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${API}/${id}?fields=status_code,status&access_token=${ACCESS_TOKEN}`);
    const { status_code } = await res.json();
    console.log(`  Container status: ${status_code}`);
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR') throw new Error(`Container processing error: ${status_code}`);
    await new Promise(r => setTimeout(r, 8_000));
  }
  throw new Error('Container timed out');
}

async function publish(containerId) {
  const res = await fetch(`${API}/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: containerId, access_token: ACCESS_TOKEN }),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error('Publish failed'), { data });
  return data;
}

// Upload a local image to imgbb and return the public URL (exported so other platforms can reuse it)
export async function uploadToImgbb(imagePath) {
  if (!IMGBB_API_KEY) throw new Error('IMGBB_API_KEY env var is required for photo posts.');
  const imageBase64 = readFileSync(imagePath).toString('base64');
  const body = new URLSearchParams({ key: IMGBB_API_KEY, image: imageBase64 });
  const res  = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body });
  const data = await res.json();
  if (!data.success) throw new Error(`imgbb upload failed: ${JSON.stringify(data.error)}`);
  console.log(`  Uploaded to imgbb ✓  ${data.data.url}`);
  return data.data.url;
}

// Post a photo to Instagram using a pre-uploaded public URL (used when sharing URL across platforms)
export async function postPhotoByUrl(imageUrl, caption) {
  if (!IG_USER_ID || !ACCESS_TOKEN) {
    throw new Error('IG_USER_ID and IG_ACCESS_TOKEN env vars are required.');
  }
  const containerRes = await fetch(`${API}/${IG_USER_ID}/media`, {
    method: 'POST',
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: ACCESS_TOKEN }),
  });
  const container = await containerRes.json();
  if (!containerRes.ok || !container.id) {
    throw Object.assign(new Error('Photo container init failed'), { data: container });
  }
  const pubRes = await fetch(`${API}/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: container.id, access_token: ACCESS_TOKEN }),
  });
  const result = await pubRes.json();
  if (!pubRes.ok) throw Object.assign(new Error('Photo publish failed'), { data: result });
  console.log(`  Instagram: Posted Photo ✓  ID: ${result.id}`);
  return result;
}

// Post a static photo to Instagram (uploads to imgbb first)
export async function postPhoto(imagePath, caption) {
  if (!IG_USER_ID || !ACCESS_TOKEN) {
    throw new Error('IG_USER_ID and IG_ACCESS_TOKEN env vars are required.');
  }

  const imageUrl = await uploadToImgbb(imagePath);

  const containerRes = await fetch(`${API}/${IG_USER_ID}/media`, {
    method: 'POST',
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: ACCESS_TOKEN }),
  });
  const container = await containerRes.json();
  if (!containerRes.ok || !container.id) {
    throw Object.assign(new Error('Photo container init failed'), { data: container });
  }

  const pubRes = await fetch(`${API}/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: container.id, access_token: ACCESS_TOKEN }),
  });
  const result = await pubRes.json();
  if (!pubRes.ok) throw Object.assign(new Error('Photo publish failed'), { data: result });
  console.log(`  Posted as Photo ✓  ID: ${result.id}`);
  return result;
}

export async function postReel(videoPath, caption, trialFirst = true) {
  if (!IG_USER_ID || !ACCESS_TOKEN) {
    throw new Error('IG_USER_ID and IG_ACCESS_TOKEN env vars are required.');
  }

  // Morning posts try Trial Reel first; evening/noon posts skip straight to regular
  const modes = trialFirst ? [true, false] : [false];
  for (const trial of modes) {
    const mode = trial ? 'Trial Reel' : 'regular Reel';
    console.log(`  Posting as ${mode}...`);
    try {
      const { id, uri } = await initContainer(caption, trial);
      await uploadVideo(uri, videoPath);
      await waitForContainer(id);
      const result = await publish(id);
      console.log(`  Posted as ${mode} ✓  ID: ${result.id}`);
      return result;
    } catch (err) {
      if (trial) {
        console.log(`  Trial Reel not available (${err.message}) — falling back...`);
      } else {
        throw err;
      }
    }
  }
}
