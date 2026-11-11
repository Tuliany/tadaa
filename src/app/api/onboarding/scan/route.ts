import { handle, HttpError, requireUser } from "@/lib/auth";
import { scrapeSiteCached } from "@/lib/scrape";

export const maxDuration = 30;

/** Quick first pass over the website for the live "Reading your site" screen. */
export const POST = handle(async (req: Request) => {
  await requireUser();
  const { website } = (await req.json()) as { website?: string };
  if (!website?.trim()) throw new HttpError(400, "Enter your website.");
  try {
    const site = await scrapeSiteCached(website);
    return Response.json({
      url: site.url,
      name: site.siteName,
      headline: site.headline || site.title,
      description: site.description,
      colors: site.colors,
      logoUrl: site.logoUrl,
      heroImage: site.imageUrls[0],
    });
  } catch (e) {
    throw new HttpError(422, `We couldn't open ${website} (${(e as Error).message}). Check the address, or continue with just a description.`);
  }
});
