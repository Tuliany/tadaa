import { handle, HttpError, requireUser } from "@/lib/auth";
import { pexelsConfigured, searchVideos } from "@/lib/pexels";

/** Search licence-free vertical stock clips (Pexels). Without ?q it just reports whether stock is available. */
export const GET = handle(async (req: Request) => {
  await requireUser();
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return Response.json({ available: pexelsConfigured() });
  if (!pexelsConfigured()) throw new HttpError(503, "Stock clips aren't set up yet.");
  try {
    return Response.json({ available: true, results: await searchVideos(q.slice(0, 80)) });
  } catch (e) {
    throw new HttpError(502, (e as Error).message);
  }
});
