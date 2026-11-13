import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { getBrand } from "@/lib/db";
import { origin } from "@/lib/oauth";
import { exchangeCode, saveLinkedInConnection } from "@/lib/linkedin";

const STATE_COOKIE = "tadaa_li_state";

/** LinkedIn sends the browser back here after the user allows (or cancels) the connection. */
export async function GET(req: Request) {
  const base = origin(req);
  const q = new URL(req.url).searchParams;
  const jar = await cookies();
  const saved = jar.get(STATE_COOKIE)?.value ?? "";
  jar.delete({ name: STATE_COOKIE, path: "/api/connect/linkedin" });

  const [state, brandId] = [saved.slice(0, saved.lastIndexOf(".")), saved.slice(saved.lastIndexOf(".") + 1)];
  const back = (result: string, message?: string) => {
    const u = new URL(brandId ? `${base}/brands/${brandId}/accounts` : `${base}/brands`);
    u.searchParams.set("linkedin", result);
    if (message) u.searchParams.set("message", message.slice(0, 200));
    return Response.redirect(u.toString(), 302);
  };

  const got = q.get("state") ?? "";
  if (!state || got.length !== state.length || !timingSafeEqual(Buffer.from(got), Buffer.from(state))) {
    return back("error", "The connection request expired. Please try again.");
  }
  if (q.get("error")) return back(/cancel|denied/.test(q.get("error") ?? "") ? "cancelled" : "error", q.get("error_description") ?? undefined);

  const user = await currentUser();
  const brand = await getBrand(brandId);
  if (!user || !brand || brand.ownerId !== user.id) return back("error", "Please log in to Tadaa and try again.");

  try {
    const tokens = await exchangeCode(q.get("code") ?? "", base);
    await saveLinkedInConnection(brand.id, user.id, tokens);
    if (tokens.scope && !tokens.scope.includes("w_member_social")) {
      return back("partial", "Posting permission wasn't granted. Reconnect and allow posting to publish from Tadaa.");
    }
    return back("connected");
  } catch (e) {
    console.error("[linkedin] connect failed", e);
    return back("error", (e as Error).message);
  }
}
