import { handle, HttpError, requireUser } from "@/lib/auth";
import { MUSIC_MOODS, soundPack } from "@/lib/sounds";

/** The built-in sound effects and music moods for the sound picker. */
export const GET = handle(async () => {
  await requireUser();
  try {
    return Response.json({ pack: await soundPack(), moods: MUSIC_MOODS });
  } catch (e) {
    throw new HttpError(502, (e as Error).message);
  }
});
