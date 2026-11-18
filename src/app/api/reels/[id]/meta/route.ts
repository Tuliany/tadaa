import { z } from "zod";
import { handle, HttpError, requireReel } from "@/lib/auth";
import { postToMeta, PublishError } from "@/lib/publish";

export const maxDuration = 300;

const body = z.object({
  caption: z.string().max(2200),
  instagram: z.boolean(),
  facebook: z.boolean(),
  shareToFeed: z.boolean(),
});

/** Post the approved Reel to the brand's Instagram and/or Facebook Page. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/reels/[id]/meta">) => {
  const { reel, brand } = await requireReel((await ctx.params).id);
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Please check the post settings.");
  try {
    return Response.json(await postToMeta(brand, reel, parsed.data));
  } catch (e) {
    if (e instanceof PublishError) throw new HttpError(e.message.startsWith("The video couldn't") ? 500 : 400, e.message);
    throw e;
  }
});
