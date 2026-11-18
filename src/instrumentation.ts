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

  // Idea Studio: make the upcoming drafts for paid plans every 30 minutes.
  const { autoDraftDue } = await import("./lib/studio");
  const tick = () =>
    autoDraftDue()
      .then((n) => n && console.log(`[studio] made ${n} draft(s)`))
      .catch((e) => console.error("[studio]", e));
  setTimeout(tick, 60_000);
  setInterval(tick, 30 * 60_000);
}
