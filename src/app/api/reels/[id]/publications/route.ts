import { handle, requireReel } from "@/lib/auth";
import { refreshPublications } from "@/lib/publish";

/** Checks every platform for posts still processing (and publishes Instagram Reels once they're ready). */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/reels/[id]/publications">) => {
  const { reel, brand } = await requireReel((await ctx.params).id);
  return Response.json(await refreshPublications(brand, reel));
});
