# Tadaa

On-brand Reels for any business. Add your website, upload a photo or clip, get a finished vertical video with hook, on-screen text, caption and hashtags in your brand's colours and voice. Ask for changes in plain words, approve, download.

## What's in the MVP

- **Brand onboarding:** reads the website (name, description, colours, logo, text), and Claude builds an editable brand profile: industry, audience, tone of voice, offers, claims to avoid, colours, logo.
- **Content languages:** English, Swedish, Spanish, German, French.
- **Media library:** upload photos and short clips per brand.
- **Three Reel formats:** Showcase, Before & After (wipe reveal), Tips list. Built with Remotion as code templates, so there are no per-video fees.
- **Live preview** in the browser, **plain-language revisions** ("make the hook funnier"), manual text edits.
- **Approve → render MP4 → download**, plus copy caption and hashtags.
- **Weekly content plan:** 7 ideas tailored to the brand, each with a "make this Reel" shortcut.

Without `ANTHROPIC_API_KEY` the app runs in **demo mode** with template text, so you can click through everything.

## Run locally

```bash
npm install
cp .env.example .env.local   # add your Anthropic API key
npm run dev                   # http://localhost:3000
```

Rendering MP4s needs Chrome or Chromium installed (auto-detected, or set `REMOTION_BROWSER`).
After changing anything in `src/remotion/`, delete `data/.remotion-bundle` so renders pick up the new templates.

## Project layout

| Path | What it is |
|---|---|
| `src/app/` | Pages (landing, onboarding, brands, new Reel, Reel review) and API routes |
| `src/lib/ai.ts` | All Claude calls: brand profile, scripts, revisions, weekly plan |
| `src/lib/scrape.ts` | Website reader: text, colours, logo |
| `src/lib/db.ts` | Data layer (local JSON file). Swap for Supabase/Postgres here |
| `src/lib/storage.ts` | File storage (local disk). Swap for Supabase Storage/S3 here |
| `src/remotion/Reel.tsx` | The video templates |
| `scripts/render.mjs` | MP4 renderer, runs as a separate process |

## Deploy

Rendering needs a real server with Chromium, so use a container host (Railway, Fly.io, Render or a VPS) rather than Vercel serverless functions. The included `Dockerfile` runs everything in one container; mount a persistent volume at `/data` and set `ANTHROPIC_API_KEY`.

## Next steps

1. Accounts and logins (Supabase Auth), with each brand belonging to a user
2. Move `db.ts` / `storage.ts` to Supabase so you can run more than one server
3. Stripe subscriptions
4. Automatic Instagram posting (requires Meta app review)
5. More templates, music, animated captions for clips with speech
