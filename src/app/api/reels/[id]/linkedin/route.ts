import { z } from "zod";
import { handle, HttpError, requireReel } from "@/lib/auth";
import { getConnection, getReel, saveReel } from "@/lib/db";
import { accessToken, postUrl, publishVideo } from "@/lib/linkedin";
import { hasRender, startRender } from "@/lib/render";
import { localFile } from "@/lib/storage";
import type { Publication, Reel } from "@/lib/types";

export const maxDuration = 300;

const body = z.object({ text: z.string().max(3000) });

/** Post the approved Reel to the connected LinkedIn profile. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/reels/[id]/linkedin">) => {
  const { reel, brand } = await requireReel((await ctx.params).id);
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "The post text can be at most 3,000 characters.");
  if (reel.status !== "approved") throw new HttpError(400, "Approve the Reel before posting it.");
  const conn = await getConnection(brand.id, "linkedin");
  if (!conn) throw new HttpError(400, "Connect LinkedIn first (Accounts → LinkedIn).");
  const token = await accessToken(conn);

  let current: Reel = reel;
  if (!(await hasRender(reel))) {
    try {
      await startRender(brand, reel);
    } catch (e) {
      console.error("[linkedin] render before posting failed", e);
      throw new HttpError(500, "The video couldn't be created, so nothing was posted. Please try again in a minute.");
    }
    current = (await getReel(reel.id)) ?? reel;
  }

  const { postUrn, videoUrn } = await publishVideo(conn, token, await localFile("renders", current.renderFile!), parsed.data.text, reel.script.hook || brand.name);
  const now = new Date().toISOString();
  const pub: Publication = {
    provider: "linkedin",
    accountName: conn.displayName,
    publishId: videoUrn,
    postId: postUrn,
    permalink: postUrl(postUrn),
    privacy: "PUBLIC",
    status: "processing",
    via: "linkedin",
    createdAt: now,
    updatedAt: now,
  };
  const latest = (await getReel(reel.id)) ?? current;
  const saved = await saveReel({ ...latest, publications: [...(latest.publications ?? []), pub], updatedAt: now });
  return Response.json(saved);
});
