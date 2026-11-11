import { CORS, mcpResource, origin, SCOPE } from "@/lib/oauth";

/** OAuth 2.0 Protected Resource Metadata (RFC 9728) for the MCP endpoint. */
export function GET(req: Request) {
  return Response.json(
    {
      resource: mcpResource(req),
      authorization_servers: [origin(req)],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "Tadaa",
    },
    { headers: CORS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
