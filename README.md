# AlongXide Social Automation

Generates a brand-new countdown reel every day and posts it to Instagram — twice daily,
9 AM and 7 PM WAT — via GitHub Actions. No PC required once deployed.

Each reel is freshly generated:
- Dark brand background with floating emerald glows
- Rotating daily problem statement ("The Problem: …")
- Animated countdown number to December 4th launch
- AlongXide branding

---

## Setup (one time)

### 1. Create the private repo on GitHub

1. Go to github.com → New repository
2. Name: `alongxide-social` (or any name)
3. Set to **Private**
4. Leave everything else unchecked

### 2. Push this code

```bash
cd C:\Dev\AlongXide-Social
git init
git add .
git commit -m "Initial automation setup"
git remote add origin https://github.com/YOUR_USERNAME/alongxide-social.git
git branch -M main
git push -u origin main
```

### 3. Add GitHub Secrets

In your repo → Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | Value |
|--------|-------|
| `IG_USER_ID` | Your Instagram Business Account ID |
| `IG_ACCESS_TOKEN` | Your long-lived Instagram access token (valid 60 days) |

#### How to get these

1. Go to [developers.facebook.com](https://developers.facebook.com) → My Apps → Create App (Business type)
2. Add the **Instagram Graph API** product
3. Connect your Instagram Business/Creator account under Instagram → Basic Display or Graph API
4. Generate a **User Access Token**, then exchange it for a **long-lived token** (60 days)
5. Your Instagram User ID appears in the app dashboard

To exchange for a long-lived token:
```bash
curl "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_LIVED_TOKEN"
```

### 4. Test manually

Repo → Actions → "Post AlongXide Reel" → **Run workflow**

Watch the run log — it will render all 450 frames (~3-4 mins), stitch the video, and post.

---

## How it works

```
GitHub Actions (runs in cloud, no PC needed)
  │
  ├── 9:00 AM WAT  ──→  node main.mjs
  └── 7:00 PM WAT  ──→  node main.mjs
                              │
                              ├── Pick today's problem + caption
                              ├── Render reel.html with Puppeteer
                              │   (450 frames × 1080×1920 → PNG sequence)
                              ├── Stitch with ffmpeg → reel.mp4
                              └── Post to Instagram Graph API
                                  (Trial Reel first, regular Reel fallback)
```

---

## Token refresh (every ~55 days)

Access tokens expire after 60 days. Refresh before they expire:

```bash
curl "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=CURRENT_TOKEN"
```

Then update the `IG_ACCESS_TOKEN` secret in GitHub.

---

## Customising

- **Problems**: edit `generate/problems.mjs`
- **Captions**: edit the `CAPTION_TEMPLATES` array in `main.mjs`
- **Post times**: edit the cron lines in `.github/workflows/post-reel.yml`
- **Visual design**: edit `generate/reel.html`
