/**
 * Posts a Reel to Instagram via the Graph API.
 * Tries Trial Reel first; falls back to regular Reel.
 */

import { readFileSync } from 'node:fs';

const IG_USER_ID   = process.env.IG_USER_ID;
const ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
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
