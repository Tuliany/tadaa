import { handle, HttpError, requireReel } from "@/lib/auth";
import { hasRender, renderError, renderProgress, renderState, startRender } from "@/lib/render";

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

/** Render status for the progress bar. */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/reels/[id]/render">) => {
  const { reel } = await requireReel((await ctx.params).id);
  const state = renderState(reel.id);
  return Response.json({
    state: state === "idle" && (await hasRender(reel)) ? "done" : state,
    progress: renderProgress(reel.id),
    error: state === "failed" ? renderError(reel.id) : undefined,
  });
});
