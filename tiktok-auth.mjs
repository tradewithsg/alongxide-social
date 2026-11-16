/**
 * AlongXide — TikTok OAuth Setup Helper
 * Run this ONCE on your PC to get your refresh token.
 *
 * Before running:
 *   1. Edit CLIENT_KEY and CLIENT_SECRET below with values from developers.tiktok.com
 *   2. Make sure  http://localhost:8080/callback  is added as a Redirect URI in your TikTok app
 *   3. Run:  node tiktok-auth.mjs
 */

import { createInterface } from 'node:readline';

// ── EDIT THESE ──────────────────────────────────────────────────────────────
const CLIENT_KEY    = 'sbawkrz5ifr6t26egw';
const CLIENT_SECRET = '8ZrG9gbhmtL8OWo2455FczZRWIzscG0N';
// ────────────────────────────────────────────────────────────────────────────

// TikTok requires https:// — browser will show an error page but the URL bar
// contains the auth code, which you paste back here.
const REDIRECT_URI = 'https://tradewithsg.github.io/alongxide-social/callback';

const authUrl = 'https://www.tiktok.com/v2/auth/authorize/?' + new URLSearchParams({
  client_key:    CLIENT_KEY,
  scope:         'video.publish,video.upload',
  response_type: 'code',
  redirect_uri:  REDIRECT_URI,
  state:         'alongxide-setup',
}).toString();

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('STEP 1 — Open this URL in your browser and log in with AlongXide TikTok:');
console.log('\n' + authUrl + '\n');
console.log('STEP 2 — After authorizing, your browser will show an error page.');
console.log('         That is normal. Copy the FULL URL from the address bar.');
console.log('         It will look like:  https://localhost/?code=XXXX&state=...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the full URL from your browser here: ', async (pastedUrl) => {
  rl.close();
  let code;
  try {
    code = new URL(pastedUrl).searchParams.get('code');
  } catch {
    console.error('Could not parse URL. Make sure you pasted the full address bar URL.');
    process.exit(1);
  }
  if (!code) {
    console.error('No "code" found in that URL. Try again from the beginning.');
    process.exit(1);
  }

  console.log('\nExchanging code for tokens...');
  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key:    CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      code,
      grant_type:    'authorization_code',
      redirect_uri:  REDIRECT_URI,
    }),
  });
  const data = await tokenRes.json();

  if (data.error) {
    console.error('Token exchange failed:', data.error_description || JSON.stringify(data));
    process.exit(1);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SUCCESS! Add these 3 values as GitHub Secrets:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`TIKTOK_CLIENT_KEY    = ${CLIENT_KEY}`);
  console.log(`TIKTOK_CLIENT_SECRET = ${CLIENT_SECRET}`);
  console.log(`TIKTOK_REFRESH_TOKEN = ${data.refresh_token}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
