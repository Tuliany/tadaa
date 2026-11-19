import { describeBusiness } from "@/lib/ai";
import { handle, HttpError, requireUser } from "@/lib/auth";
import { scrapeSiteCached } from "@/lib/scrape";
import { LANGUAGES } from "@/lib/types";

export const maxDuration = 30;

/** Onboarding: reads the website and suggests "what you do, and for whom" (plus the site's language). */
export const POST = handle(async (req: Request) => {
  await requireUser();
  const { website } = (await req.json()) as { website?: string };
  if (!website?.trim()) throw new HttpError(400, "Enter your website.");
  let site;
  try {
    site = await scrapeSiteCached(website);
  } catch (e) {
    throw new HttpError(422, `We couldn't open ${website} (${(e as Error).message}).`);
  }
  const code = (site.lang || "").toLowerCase().slice(0, 2);
  return Response.json({
    description: await describeBusiness(site),
    language: code in LANGUAGES ? code : undefined,
  });
});
