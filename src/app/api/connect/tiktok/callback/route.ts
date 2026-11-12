import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { getBrand } from "@/lib/db";
import { origin } from "@/lib/oauth";
import { exchangeCode, saveTikTokConnection } from "@/lib/tiktok";

const STATE_COOKIE = "tadaa_tiktok_state";

/** TikTok sends the browser back here after the user allows (or cancels) the connection. */
export async function GET(req: Request) {
  const base = origin(req);
  const q = new URL(req.url).searchParams;
  const jar = await cookies();
  const saved = jar.get(STATE_COOKIE)?.value ?? "";
  jar.delete({ name: STATE_COOKIE, path: "/api/connect/tiktok" });

  const [state, brandId] = [saved.slice(0, saved.lastIndexOf(".")), saved.slice(saved.lastIndexOf(".") + 1)];
  const back = (result: string, message?: string) => {
    const u = new URL(brandId ? `${base}/brands/${brandId}/accounts` : `${base}/brands`);
    u.searchParams.set("tiktok", result);
    if (message) u.searchParams.set("message", message.slice(0, 200));
    return Response.redirect(u.toString(), 302);
  };

  const got = q.get("state") ?? "";
  if (!state || got.length !== state.length || !timingSafeEqual(Buffer.from(got), Buffer.from(state))) {
    return back("error", "The connection request expired. Please try again.");
  }
  if (q.get("error")) return back(q.get("error") === "access_denied" ? "cancelled" : "error", q.get("error_description") ?? undefined);

  const user = await currentUser();
  const brand = await getBrand(brandId);
  if (!user || !brand || brand.ownerId !== user.id) return back("error", "Please log in to Tadaa and try again.");

  try {
    const tokens = await exchangeCode(q.get("code") ?? "", base);
    const missing = ["video.publish"].filter((s) => !tokens.scope.split(",").includes(s));
    await saveTikTokConnection(brand.id, user.id, tokens);
    if (missing.length) return back("partial", "Posting permission wasn't granted. Reconnect and allow posting to publish from Tadaa.");
    return back("connected");
  } catch (e) {
    console.error("[tiktok] connect failed", e);
    return back("error", (e as Error).message);
  }
}
