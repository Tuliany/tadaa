import { z } from "zod";
import { memeCaptions } from "@/lib/ai";
import { handle, HttpError, requireBrand } from "@/lib/auth";

export const maxDuration = 60;

/** Three meme caption ideas (top caption + optional punchline) in the brand's voice. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/meme-captions">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const body = z.object({ topic: z.string().max(200).optional(), clip: z.string().max(200).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) throw new HttpError(400, "Bad request.");
  try {
    return Response.json({ options: await memeCaptions(brand, body.data.topic ?? "", body.data.clip ?? "") });
  } catch (e) {
    throw new HttpError(502, `Couldn't write captions: ${(e as Error).message}`);
  }
});
