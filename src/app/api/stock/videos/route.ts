import { handle, HttpError, requireUser } from "@/lib/auth";
import { PROVIDER_NAME, searchStock, stockProvider } from "@/lib/stock";

/** Search licence-free stock clips. Without ?q it just reports whether (and which) stock library is available. */
export const GET = handle(async (req: Request) => {
  await requireUser();
  const provider = stockProvider();
  const info = { available: !!provider, provider: provider ? PROVIDER_NAME[provider] : null };
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return Response.json(info);
  if (!provider) throw new HttpError(503, "Stock clips aren't set up yet.");
  try {
    return Response.json({ ...info, results: await searchStock(q.slice(0, 80)) });
  } catch (e) {
    throw new HttpError(502, (e as Error).message);
  }
});
