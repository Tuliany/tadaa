import { z } from "zod";
import { handle, HttpError, requireReel } from "@/lib/auth";
import { postToLinkedIn, PublishError } from "@/lib/publish";

export const maxDuration = 300;

const body = z.object({ text: z.string().max(3000) });

/** Post the approved Reel to the connected LinkedIn profile or company page. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/reels/[id]/linkedin">) => {
  const { reel, brand } = await requireReel((await ctx.params).id);
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "The post text can be at most 3,000 characters.");
  try {
    return Response.json(await postToLinkedIn(brand, reel, parsed.data.text));
  } catch (e) {
    if (e instanceof PublishError) throw new HttpError(e.message.startsWith("The video couldn't") ? 500 : 400, e.message);
    throw e;
  }
});
