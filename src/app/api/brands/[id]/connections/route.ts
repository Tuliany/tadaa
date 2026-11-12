import { handle, HttpError, requireBrand } from "@/lib/auth";
import { deleteConnection, getConnection } from "@/lib/db";
import { decrypt } from "@/lib/oauth";
import { revokeToken, tiktokConfigured } from "@/lib/tiktok";

/** The brand's connected social accounts (no tokens). */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/brands/[id]/connections">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const tt = await getConnection(brand.id, "tiktok");
  return Response.json({
    tiktok: {
      available: tiktokConfigured(),
      connected: !!tt,
      displayName: tt?.displayName,
      avatarUrl: tt?.avatarUrl,
      canPost: !!tt?.scope.split(",").includes("video.publish"),
      connectedAt: tt?.createdAt,
    },
  });
});

/** Disconnect: revoke at TikTok and forget the tokens. */
export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/connections">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const provider = new URL(req.url).searchParams.get("provider");
  if (provider !== "tiktok") throw new HttpError(400, "Unknown provider");
  const conn = await getConnection(brand.id, "tiktok");
  if (conn) {
    await revokeToken(await decrypt(conn.accessTokenEnc)).catch(() => {});
    await deleteConnection(brand.id, "tiktok");
  }
  return Response.json({ ok: true });
});
