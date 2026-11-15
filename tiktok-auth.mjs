/**
 * AlongXide — TikTok OAuth Setup Helper
 * Run this ONCE on your PC to get your refresh token.
 *
 * Before running:
 *   1. Edit CLIENT_KEY and CLIENT_SECRET below with values from developers.tiktok.com
 *   2. Make sure  http://localhost:8080/callback  is added as a Redirect URI in your TikTok app
 *   3. Run:  node tiktok-auth.mjs
 */

import http from 'node:http';

// ── EDIT THESE ──────────────────────────────────────────────────────────────
const CLIENT_KEY    = 'YOUR_CLIENT_KEY_HERE';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
// ────────────────────────────────────────────────────────────────────────────

const REDIRECT_URI = 'http://localhost:8080/callback';

const authUrl = 'https://www.tiktok.com/v2/auth/authorize/?' + new URLSearchParams({
  client_key:    CLIENT_KEY,
  scope:         'video.publish,video.upload',
  response_type: 'code',
  redirect_uri:  REDIRECT_URI,
  state:         'alongxide-setup',
}).toString();

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Open this URL in your browser and log in with your AlongXide TikTok:');
console.log('\n' + authUrl + '\n');
console.log('Waiting for authorization (keep this terminal open)...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const server = http.createServer(async (req, res) => {
  const url  = new URL(req.url, 'http://localhost:8080');
  const code = url.searchParams.get('code');

  if (!code) {
    res.writeHead(400);
    res.end('No code received — close this and try again.');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h2 style="font-family:sans-serif;color:green">Done! Check your terminal for the secrets to copy.</h2>');
  server.close();

  console.log('Code received. Exchanging for tokens...\n');

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

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SUCCESS! Add these 3 values as GitHub Secrets:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`TIKTOK_CLIENT_KEY    = ${CLIENT_KEY}`);
  console.log(`TIKTOK_CLIENT_SECRET = ${CLIENT_SECRET}`);
  console.log(`TIKTOK_REFRESH_TOKEN = ${data.refresh_token}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

server.listen(8080, '127.0.0.1', () => {
  console.log('Listening on http://localhost:8080/callback\n');
});
