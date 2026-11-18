/** Runs once when the server starts, before it takes requests. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { migrateFromDisk } = await import("./lib/migrate");
  try {
    await migrateFromDisk();
  } catch (e) {
    // Don't serve with a half-moved database: crash so Railway restarts and retries.
    console.error("[migrate] failed:", e);
    throw e;
  }

  // Idea Studio: make the upcoming drafts for paid plans, and the weekly email, every 30 minutes.
  const { autoDraftDue } = await import("./lib/studio");
  const { weeklyEmails } = await import("./lib/weekly");
  const tick = () => {
    autoDraftDue()
      .then((n) => n && console.log(`[studio] made ${n} draft(s)`))
      .catch((e) => console.error("[studio]", e));
    // Monday "your week" email (sent once per week from 08:00).
    weeklyEmails()
      .then((n) => n && console.log(`[weekly] sent ${n} email(s)`))
      .catch((e) => console.error("[weekly]", e));
  };
  setTimeout(tick, 60_000);
  setInterval(tick, 30 * 60_000);
  // Idea Studio: post approved Reels at their time (checked every 5 minutes).
  const { autoPostTick } = await import("./lib/autopost");
  const post = () =>
    autoPostTick()
      .then((n) => n && console.log(`[autopost] posted ${n} Reel(s)`))
      .catch((e) => console.error("[autopost]", e));
  setTimeout(post, 90_000);
  setInterval(post, 5 * 60_000);
}
