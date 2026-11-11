import { handleRpc } from "@/lib/mcp";
import { bearerUser, CORS, origin, protectedResourceMetadataUrl, SCOPE } from "@/lib/oauth";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

function unauthorized(req: Request, description = "Sign in to Tadaa to use this connector.") {
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: description } },
    {
      status: 401,
      headers: {
        ...CORS,
        "www-authenticate": `Bearer resource_metadata="${protectedResourceMetadataUrl(req)}", scope="${SCOPE}"`,
      },
    },
  );
}

/** MCP Streamable HTTP endpoint (stateless, JSON responses). */
export async function POST(req: Request) {
  const auth = await bearerUser(req);
  if (!auth) return unauthorized(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  }

  const ctx = { user: auth.user, origin: origin(req) };
  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.map((m) => handleRpc(m, ctx)))).filter((r) => r !== null);

  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(Array.isArray(body) ? replies : replies[0], { headers: CORS });
}

/**
 * No server-initiated stream: this server only answers requests.
 * People who open the URL in a browser get a short explanation instead of a bare 405.
 */
export function GET(req: Request) {
  if ((req.headers.get("accept") ?? "").includes("text/html")) {
    const url = `${origin(req)}/mcp`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tadaa connector for Claude</title><link rel="icon" href="/icon.png">
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#fff8f0;color:#16131a;margin:0;display:grid;place-items:center;min-height:100vh}
.card{background:#fff;border-radius:20px;padding:32px;max-width:460px;box-shadow:0 1px 3px rgba(0,0,0,.08)}h1{margin:0 0 8px;font-size:24px}
code{display:block;background:#f4efe9;border-radius:10px;padding:10px 12px;margin:12px 0;font-size:15px}ol{padding-left:20px;line-height:1.6}a{color:#ff5a5f;font-weight:600}</style></head>
<body><div class="card"><h1>This is the Tadaa connector for Claude</h1>
<p>This address isn't a web page – paste it into Claude to connect your Tadaa account:</p><code>${url}</code>
<ol><li>In Claude, open <b>Settings → Connectors</b></li><li>Click <b>Add custom connector</b>, name it <b>Tadaa</b> and paste the address</li>
<li>Click <b>Connect</b>, log in to Tadaa and press <b>Allow</b></li></ol>
<p><a href="/brands">Back to Tadaa</a></p></div></body></html>`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return new Response("Method Not Allowed", { status: 405, headers: { ...CORS, allow: "POST, OPTIONS" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { ...CORS, allow: "POST, OPTIONS" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
