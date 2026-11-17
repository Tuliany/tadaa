# Tadaa roadmap

Tadaa makes the video for you. CapCut is an editor where the user does the work. We are not trying to become CapCut. We borrow the CapCut features that make the finished Reel better, as long as they keep the "no editing needed" promise.

Tick items off here as they ship.

## Done

- [x] Accounts and logins, with each brand belonging to a user
- [x] Postgres database and S3-compatible file storage (Railway Postgres + Railway Bucket)
- [x] Posting to Instagram, Facebook, LinkedIn and TikTok (Meta app review still needed for public use)
- [x] Claude connection (MCP server + OAuth)

## Next: closing the gap with CapCut

Ordered by value. The first two close most of the visible quality gap.

1. [ ] **Music.** A royalty-free library licensed for commercial use. The AI picks a track by mood and brand, cuts line up with the beat, and the user can swap the track. No trending Instagram audio, because that licence doesn't carry over to rendered files.
2. [ ] **Auto-captions for clips with speech.** Transcribe the clip (for example with Whisper), then render word-by-word animated captions in brand colours with `@remotion/captions`.
3. [ ] **AI voiceover.** Claude writes the script and a text-to-speech service (for example ElevenLabs) reads it, so a set of photos becomes a narrated Reel.
4. [ ] **Multi-clip Reels.** Upload 3–8 clips; the AI orders and trims them and adds transitions. Most of the value of a timeline, without building one.
5. [ ] **More templates.** Grow from 4 formats (Showcase, Before & After, Tips, Meme) to 15–20: listicle, day-in-the-life, testimonial, product reveal, countdown, POV and similar. Build on the reference-video looks.
6. [ ] **Light manual editor.** Drag text, change timing, swap clips, nudge cuts. For a full timeline, look at Remotion's paid editor starter instead of building from scratch.

## Later

- [ ] Stripe subscriptions
- [ ] Mobile app (App Store)
