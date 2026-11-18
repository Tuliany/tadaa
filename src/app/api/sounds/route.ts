import { handle, HttpError, requireUser } from "@/lib/auth";
import { importSound, searchSounds, soundUrl, strip } from "@/lib/sounds";

/** Search CC0 sound effects or music. */
export const GET = handle(async (req: Request) => {
  await requireUser();
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "music" ? "music" : "effect";
  try {
    const hits = await searchSounds(url.searchParams.get("q") ?? "", kind);
    return Response.json(hits);
  } catch (e) {
    throw new HttpError(502, (e as Error).message);
  }
});

/** Use a sound: copies it into Tadaa's storage and returns it. */
export const POST = handle(async (req: Request) => {
  await requireUser();
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) throw new HttpError(400, "Pick a sound.");
  try {
    const s = await importSound(id);
    return Response.json({ ...strip(s), preview: soundUrl(s.id) });
  } catch (e) {
    throw new HttpError(502, (e as Error).message);
  }
});
