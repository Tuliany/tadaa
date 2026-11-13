import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { getBrand } from "@/lib/db";
import { exchangeCode, saveInstagramConnection } from "@/lib/instagram";
import { origin } from "@/lib/oauth";

const STATE_COOKIE = "tadaa_ig_state";

/** Meta sends the browser back here (Connect Instagram) after the user allows (or cancels) the connection. */
export async function GET(req: Request) {
  const base = origin(req);
  const q = new URL(req.url).searchParams;
  const jar = await cookies();
  const saved = jar.get(STATE_COOKIE)?.value ?? "";
  jar.delete({ name: STATE_COOKIE, path: "/api/connect/instagram" });
  const dot = saved.lastIndexOf(".");
  const [state, brandId] = [saved.slice(0, dot), saved.slice(dot + 1)];
  const back = (result: string, message?: string) => {
    const u = new URL(brandId ? `${base}/brands/${brandId}/accounts` : `${base}/brands`);
    u.searchParams.set("instagram", result);
    if (message) u.searchParams.set("message", message.slice(0, 200));
    return Response.redirect(u.toString(), 302);
  };

  const got = q.get("state") ?? "";
  if (!state || got.length !== state.length || !timingSafeEqual(Buffer.from(got), Buffer.from(state))) {
    return back("error", "The connection request expired. Please try again.");
  }
  if (q.get("error")) return back(q.get("error_reason") === "user_denied" ? "cancelled" : "error", q.get("error_description") ?? undefined);

  const user = await currentUser();
  const brand = await getBrand(brandId);
  if (!user || !brand || brand.ownerId !== user.id) return back("error", "Please log in to Tadaa and try again.");

  try {
    const token = await exchangeCode(q.get("code") ?? "", base);
    const conn = await saveInstagramConnection(brand.id, user.id, token);
    if (!conn.pages?.length) {
      return back("noaccounts", "No Instagram professional account was shared with Tadaa. Reconnect and select your account – it must be a Business or Creator account.");
    }
    return back("connected");
  } catch (e) {
    console.error("[instagram] connect failed", e);
    return back("error", (e as Error).message);
  }
}
