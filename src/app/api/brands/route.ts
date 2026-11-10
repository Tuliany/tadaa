import { nanoid } from "nanoid";
import { buildBrandProfile } from "@/lib/ai";
import { listBrands, saveBrand } from "@/lib/db";
import { scrapeSite, type SiteInfo } from "@/lib/scrape";
import { LANGUAGES, type Brand, type Language } from "@/lib/types";

export async function GET() {
  return Response.json(await listBrands());
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    website?: string;
    instagram?: string;
    name?: string;
    language?: Language;
    notes?: string;
  };
  if (!body.website && !body.name) {
    return Response.json({ error: "Enter your website or your business name." }, { status: 400 });
  }
  const language: Language = body.language && body.language in LANGUAGES ? body.language : "en";

  let site: SiteInfo | null = null;
  let siteWarning: string | undefined;
  if (body.website) {
    try {
      site = await scrapeSite(body.website);
    } catch (e) {
      siteWarning = `We couldn't read ${body.website} (${(e as Error).message}). The profile is based on what you entered – you can edit it below.`;
    }
  }

  try {
    const draft = await buildBrandProfile(site, { name: body.name, language, notes: body.notes });
    const brand: Brand = {
      ...draft,
      id: nanoid(10),
      website: site?.url ?? body.website,
      instagram: body.instagram?.replace(/^@/, ""),
      logoUrl: site?.logoUrl,
      language,
      createdAt: new Date().toISOString(),
    };
    await saveBrand(brand);
    return Response.json({ brand, warning: siteWarning });
  } catch (e) {
    return Response.json({ error: `Could not build the brand profile: ${(e as Error).message}` }, { status: 502 });
  }
}
