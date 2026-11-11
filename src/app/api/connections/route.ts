import { handle, requireUser } from "@/lib/auth";
import { listConnectedClients, revokeUserTokens } from "@/lib/db";
import { publicOrigin } from "@/lib/email";

/** Apps connected to this account through OAuth (e.g. Claude), plus the connector URL to add. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  return Response.json({ connectorUrl: `${publicOrigin(req)}/mcp`, apps: await listConnectedClients(user.id) });
});

/** Disconnect one app (?clientId=…) or all of them. */
export const DELETE = handle(async (req: Request) => {
  const user = await requireUser();
  const clientId = new URL(req.url).searchParams.get("clientId") ?? undefined;
  await revokeUserTokens(user.id, clientId);
  return Response.json({ ok: true });
});
