import { getUser, updateUser } from "@/lib/db";
import { appOrigin } from "@/lib/email";
import { verifyUnsubscribe } from "@/lib/oauth";

/** One-click unsubscribe from the weekly email (link in the email, and the List-Unsubscribe header). */
async function unsubscribe(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("u") ?? "";
  const ok = id && (await verifyUnsubscribe(id, url.searchParams.get("t"))) && (await getUser(id));
  if (ok) await updateUser(id, { emails: { ...(ok.emails ?? {}), weekly: false } });
  return ok;
}

export async function POST(req: Request) {
  return (await unsubscribe(req)) ? new Response("Unsubscribed") : new Response("Invalid link", { status: 400 });
}

export async function GET(req: Request) {
  const ok = await unsubscribe(req);
  const body = ok
    ? `<h1>You're unsubscribed</h1><p>You won't get the weekly email any more. You can turn it back on in your <a href="${appOrigin()}/account">account settings</a>.</p>`
    : `<h1>This link doesn't work</h1><p>Turn the weekly email off in your <a href="${appOrigin()}/account">account settings</a> instead.</p>`;
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tadaa</title></head><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:64px auto;padding:0 16px;color:#1a1a1a">${body}</body></html>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
