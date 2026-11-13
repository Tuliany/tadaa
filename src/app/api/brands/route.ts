import { nanoid } from "nanoid";
import { buildBrandProfile } from "@/lib/ai";
import { handle, HttpError, requireUser } from "@/lib/auth";
import { listBrands, saveBrand } from "@/lib/db";
import { scrapeSiteCached, type SiteInfo } from "@/lib/scrape";
import { ndjson, wantsStream } from "@/lib/stream";
import { LANGUAGES, type Brand, type Language } from "@/lib/types";

export const maxDuration = 60;

export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json(await listBrands(user.id));
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = (await req.json()) as {
    website?: string;
    description?: string;
    referenceReels?: string[];
    instagram?: string;
    name?: string;
    language?: Language;
    notes?: string;
  };
  const notes = [body.description, body.notes].filter(Boolean).join("\n");
  if (!body.website && !body.name && !notes) {
    throw new HttpError(400, "Enter your website or tell us about your business.");
  }
  const language: Language = body.language && body.language in LANGUAGES ? body.language : "en";

  let site: SiteInfo | null = null;
  let warning: string | undefined;
  if (body.website) {
    try {
      site = await scrapeSiteCached(body.website);
    } catch (e) {
      warning = `We couldn't read ${body.website} (${(e as Error).message}). The profile is based on what you wrote – you can edit it below.`;
    }
  }

  const create = async (onPartial?: (p: Record<string, unknown>) => void) => {
    const draft = await buildBrandProfile(site, { name: body.name, language, notes }, onPartial);
    const brand: Brand = {
      ...draft,
      id: nanoid(10),
      ownerId: user.id,
      headline: site?.headline || undefined,
      website: site?.url ?? body.website,
      instagram: body.instagram?.replace(/^@/, ""),
      logoUrl: site?.logoUrl,
      language,
      referenceReels: (body.referenceReels ?? []).map((r) => r.trim()).filter((r) => /^https?:\/\//.test(r)).slice(0, 6),
      createdAt: new Date().toISOString(),
    };
    await saveBrand(brand);
    return { brand, warning };
  };
  // The onboarding screen asks for a stream so the brand kit fills in as it's written.
  if (wantsStream(req)) return ndjson((send) => create(send));
  return Response.json(await create());
});
