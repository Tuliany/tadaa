import { handle, HttpError, requireReel } from "@/lib/auth";
import { hasRender, startRender } from "@/lib/render";

export const maxDuration = 300;

/** Renders the Reel to MP4 (or returns the cached render) and responds with its download URL. */
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/reels/[id]/render">) => {
  const { reel, brand } = await requireReel((await ctx.params).id);
  const url = `/api/reels/${reel.id}/download`;
  if (await hasRender(reel)) return Response.json({ url });
  try {
    await startRender(brand, reel);
    return Response.json({ url });
  } catch (e) {
    throw new HttpError(500, `The video couldn't be created. Please try again in a minute. (${(e as Error).message})`);
  }
});
