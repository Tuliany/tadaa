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

/** No server-initiated stream: this server only answers requests. */
export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { ...CORS, allow: "POST, OPTIONS" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { ...CORS, allow: "POST, OPTIONS" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
