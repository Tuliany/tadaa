import { z } from "zod";
import { handle, HttpError, requireBrand } from "@/lib/auth";
import { deleteConnection, getConnection, saveConnection } from "@/lib/db";
import { metaConfigured, revoke as revokeMeta } from "@/lib/meta";
import { decrypt } from "@/lib/oauth";
import { revokeToken, tiktokConfigured } from "@/lib/tiktok";

/** The brand's connected social accounts (no tokens). */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/brands/[id]/connections">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const [tt, meta] = await Promise.all([getConnection(brand.id, "tiktok"), getConnection(brand.id, "meta")]);
  const page = meta?.pages?.find((p) => p.id === meta.selectedPageId);
  return Response.json({
    tiktok: {
      available: tiktokConfigured(),
      connected: !!tt,
      displayName: tt?.displayName,
      avatarUrl: tt?.avatarUrl,
      canPost: !!tt?.scope.split(",").includes("video.publish"),
      connectedAt: tt?.createdAt,
    },
    meta: {
      available: metaConfigured(),
      connected: !!meta,
      displayName: meta?.displayName,
      expired: meta ? Date.parse(meta.accessExpiresAt) < Date.now() : false,
      pages: (meta?.pages ?? []).map((p) => ({ id: p.id, name: p.name, pictureUrl: p.pictureUrl, igUsername: p.igUsername, igPictureUrl: p.igPictureUrl })),
      selectedPageId: meta?.selectedPageId,
      page: page ? { id: page.id, name: page.name, pictureUrl: page.pictureUrl } : null,
      instagram: page?.igId ? { username: page.igUsername, pictureUrl: page.igPictureUrl } : null,
    },
  });
});

/** Choose which Facebook Page (and its Instagram) this brand posts to. */
export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/connections">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const body = z.object({ provider: z.literal("meta"), pageId: z.string() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) throw new HttpError(400, "Choose a Page");
  const conn = await getConnection(brand.id, "meta");
  if (!conn?.pages?.some((p) => p.id === body.data.pageId)) throw new HttpError(404, "Page not found");
  await saveConnection({ ...conn, selectedPageId: body.data.pageId, updatedAt: new Date().toISOString() });
  return Response.json({ ok: true });
});

/** Disconnect: revoke at the platform and forget the tokens. */
export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/connections">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const provider = new URL(req.url).searchParams.get("provider");
  if (provider === "tiktok") {
    const conn = await getConnection(brand.id, "tiktok");
    if (conn) {
      await revokeToken(await decrypt(conn.accessTokenEnc)).catch(() => {});
      await deleteConnection(brand.id, "tiktok");
    }
  } else if (provider === "meta") {
    const conn = await getConnection(brand.id, "meta");
    if (conn) {
      await revokeMeta(conn);
      await deleteConnection(brand.id, "meta");
    }
  } else throw new HttpError(400, "Unknown provider");
  return Response.json({ ok: true });
});
