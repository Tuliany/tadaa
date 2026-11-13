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
}
