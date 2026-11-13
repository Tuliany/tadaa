import { handle, requireUser } from "@/lib/auth";

/** Public Google Picker settings (client id, browser API key, project number) – none of these are secrets. */
export const GET = handle(async () => {
  await requireUser();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const apiKey = process.env.GOOGLE_PICKER_API_KEY;
  const appId = process.env.GOOGLE_PROJECT_NUMBER;
  if (!clientId || !apiKey || !appId) return Response.json({ available: false });
  return Response.json({ available: true, clientId, apiKey, appId });
});
