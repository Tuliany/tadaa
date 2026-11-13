import { nanoid } from "nanoid";
import { z } from "zod";
import { generatePlan, reviseReelScript, writeReelScript } from "./ai";
import { pickStyle } from "./styles";
import { getBrand, getPlan, getReel, listBrands, listMedia, listReels, saveReel, savePlan } from "./db";
import { signDownload } from "./oauth";
import { hasRender, renderError, renderState, startRender } from "./render";
import { TEMPLATES } from "./templates";
import { LANGUAGES, type Brand, type MediaItem, type Reel, type ReelScript, type TemplateId, type User } from "./types";

/**
 * Tadaa as an MCP server (the "Claude connector").
 * Stateless Streamable HTTP: every POST carries one JSON-RPC message (or a batch) and gets a JSON reply.
 */

export const SERVER_INFO = { name: "tadaa", title: "Tadaa", version: "1.0.0" };
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export const INSTRUCTIONS = `Tadaa turns a business's website and photos into on-brand vertical Reels (9:16 videos for Instagram, TikTok, Facebook and LinkedIn).

Typical flow: list_brands → get_brand (Brand Brain, photos, recent Reels) → optionally get_ideas → create_reel → review with the user → update_reel → approve_reel → export_video.

When you write a script yourself, follow the brand's voice and language, never use anything in claims_to_avoid, and keep on-screen text short: hook up to ~8 words, each slide up to ~14 words, CTA up to ~6 words. Use the brand's own photo ids from get_brand for slides. If you omit the script, Tadaa writes one.

Always share the edit_link so the user can preview the Reel, and the download_link after export_video.`;

interface Ctx {
  user: User;
  origin: string;
}

class ToolError extends Error {}

// ---------- helpers ----------

async function ownBrand(ctx: Ctx, brandId: string) {
  const brand = await getBrand(brandId);
  if (!brand || brand.ownerId !== ctx.user.id) throw new ToolError(`No brand with id "${brandId}". Call list_brands to see the user's brands.`);
  return brand;
}

async function ownReel(ctx: Ctx, reelId: string) {
  const reel = await getReel(reelId);
  if (!reel) throw new ToolError(`No Reel with id "${reelId}".`);
  const brand = await ownBrand(ctx, reel.brandId);
  return { reel, brand };
}

function brandSummary(b: Brand) {
  return { brand_id: b.id, name: b.name, industry: b.industry, website: b.website ?? null, language: LANGUAGES[b.language] };
}

function mediaSummary(m: MediaItem) {
  return { media_id: m.id, kind: m.kind, file_name: m.fileName, added: m.createdAt.slice(0, 10) };
}

async function reelView(ctx: Ctx, reel: Reel, brand: Brand) {
  const rendered = await hasRender(reel);
  const state = renderState(reel.id);
  const video = rendered
    ? { status: "ready", download_link: `${ctx.origin}/api/reels/${reel.id}/download?${await signDownload(reel.id)}` }
    : state === "rendering"
      ? { status: "rendering", note: "Export in progress. Call get_reel again in about a minute." }
      : state === "failed"
        ? { status: "failed", error: renderError(reel.id) ?? "unknown error" }
        : { status: "not_exported", note: "Call export_video to make the MP4." };
  return {
    reel_id: reel.id,
    brand: brand.name,
    topic: reel.topic,
    template: reel.script.template,
    status: reel.status,
    script: {
      hook: reel.script.hook,
      slides: reel.script.slides.map((s) => ({ text: s.text, media_id: s.mediaId ?? null })),
      cta: reel.script.cta,
      caption: reel.script.caption,
      hashtags: reel.script.hashtags,
    },
    media_ids: reel.mediaIds,
    video,
    edit_link: `${ctx.origin}/reels/${reel.id}`,
    updated_at: reel.updatedAt,
  };
}

const slideInput = z.object({
  text: z.string().min(1).max(110).describe("On-screen text for this slide, ideally up to 14 words."),
  media_id: z.string().optional().describe("Photo or clip shown behind this slide (a media_id from get_brand)."),
});

const scriptInput = z.object({
  hook: z.string().min(1).max(90).describe("First on-screen line, shown for 2 seconds. Up to ~8 words."),
  slides: z.array(slideInput).min(2).max(6),
  cta: z.string().min(1).max(60).describe("End-card call to action, up to ~6 words."),
  caption: z.string().max(1200).describe("Post caption, 2-4 short lines."),
  hashtags: z.array(z.string()).max(10),
});

function buildScript(template: TemplateId, input: z.infer<typeof scriptInput>, media: MediaItem[]): ReelScript {
  const ids = new Set(media.map((m) => m.id));
  return {
    template,
    hook: input.hook.trim(),
    slides: input.slides.map((s, i) => {
      if (s.media_id && !ids.has(s.media_id)) throw new ToolError(`Slide ${i + 1}: media_id "${s.media_id}" isn't one of this brand's photos.`);
      return { text: s.text.trim(), mediaId: s.media_id };
    }),
    cta: input.cta.trim(),
    caption: input.caption.trim(),
    hashtags: input.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, "")),
  };
}

// ---------- tools ----------

const templateEnum = z.enum(["showcase", "beforeAfter", "tips"]);
const templateHelp = Object.entries(TEMPLATES)
  .map(([id, t]) => `${id}: ${t.description} (${t.slideCount}; media: ${t.mediaHint})`)
  .join(" | ");

interface Tool<S extends z.ZodType> {
  name: string;
  title: string;
  description: string;
  input: S;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  run: (ctx: Ctx, args: z.infer<S>) => Promise<unknown>;
}

function tool<S extends z.ZodType>(t: Tool<S>) {
  return t as unknown as Tool<z.ZodType>;
}

export const TOOLS = [
  tool({
    name: "list_brands",
    title: "List brands",
    description: "List the brands (businesses) in the user's Tadaa account. Start here to get a brand_id.",
    input: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (ctx) => {
      const brands = await listBrands(ctx.user.id);
      return {
        brands: brands.map(brandSummary),
        ...(brands.length ? {} : { note: `No brands yet. The user can add one at ${ctx.origin}/onboarding (it reads their website).` }),
      };
    },
  }),
  tool({
    name: "get_brand",
    title: "Get Brand Brain",
    description:
      "Get a brand's Brand Brain (description, audience, voice, offers, claims to avoid, colours, language), its photo/clip library with media_ids, and its most recent Reels.",
    input: z.object({ brand_id: z.string() }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (ctx, { brand_id }) => {
      const b = await ownBrand(ctx, brand_id);
      const [media, reels] = await Promise.all([listMedia(b.id), listReels(b.id)]);
      return {
        ...brandSummary(b),
        headline: b.headline ?? null,
        description: b.description,
        audience: b.audience,
        voice: b.voice,
        offers: b.offers,
        claims_to_avoid: b.claimsToAvoid,
        colors: b.colors,
        reference_reels: b.referenceReels,
        media: media.slice(0, 60).map(mediaSummary),
        media_count: media.length,
        recent_reels: reels.slice(0, 10).map((r) => ({ reel_id: r.id, topic: r.topic, template: r.script.template, status: r.status, created: r.createdAt.slice(0, 10) })),
        templates: templateHelp,
        upload_photos_link: `${ctx.origin}/brands/${b.id}/new`,
        edit_brand_link: `${ctx.origin}/brands/${b.id}/edit`,
      };
    },
  }),
  tool({
    name: "get_ideas",
    title: "Get Reel ideas",
    description: "Get this week's Reel ideas for a brand (7 ideas with template, hook and what to film). Set refresh to true to generate a new set.",
    input: z.object({ brand_id: z.string(), refresh: z.boolean().optional().describe("Generate new ideas instead of returning the saved ones.") }),
    annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    run: async (ctx, { brand_id, refresh }) => {
      const b = await ownBrand(ctx, brand_id);
      let plan = refresh ? null : await getPlan(b.id);
      if (!plan) plan = await savePlan({ brandId: b.id, ideas: await generatePlan(b), createdAt: new Date().toISOString() });
      return {
        brand: b.name,
        created: plan.createdAt.slice(0, 10),
        ideas: plan.ideas.map((i) => ({ title: i.title, template: i.template, hook: i.hook, needs_media: i.needsMedia })),
      };
    },
  }),
  tool({
    name: "list_reels",
    title: "List Reels",
    description: "List a brand's Reels (newest first) with their status.",
    input: z.object({ brand_id: z.string() }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (ctx, { brand_id }) => {
      const b = await ownBrand(ctx, brand_id);
      const reels = await listReels(b.id);
      return {
        brand: b.name,
        reels: reels.map((r) => ({
          reel_id: r.id,
          topic: r.topic,
          template: r.script.template,
          hook: r.script.hook,
          status: r.status,
          created: r.createdAt.slice(0, 10),
          edit_link: `${ctx.origin}/reels/${r.id}`,
        })),
      };
    },
  }),
  tool({
    name: "create_reel",
    title: "Create a Reel",
    description: `Create a new Reel draft for a brand. Either pass a full script you wrote (recommended when you've discussed it with the user), or leave script out and Tadaa writes it from the topic. Templates: ${templateHelp}. For beforeAfter, slide 1 must show the BEFORE photo and slide 2 the AFTER photo.`,
    input: z.object({
      brand_id: z.string(),
      topic: z.string().min(2).max(200).describe("What the Reel is about, e.g. 'Our new autumn menu'."),
      template: templateEnum.optional().describe("Default: showcase."),
      media_ids: z.array(z.string()).max(8).optional().describe("Photos/clips to use, in order (media_ids from get_brand)."),
      script: scriptInput.optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: async (ctx, args) => {
      const b = await ownBrand(ctx, args.brand_id);
      const template: TemplateId = args.template ?? "showcase";
      const all = await listMedia(b.id);
      const byId = new Map(all.map((m) => [m.id, m]));
      const chosen = (args.media_ids ?? []).map((id) => {
        const m = byId.get(id);
        if (!m) throw new ToolError(`media_id "${id}" isn't one of this brand's photos. Use get_brand to see them.`);
        return m;
      });
      let script: ReelScript;
      let media = chosen;
      if (args.script) {
        script = buildScript(template, args.script, all);
        const fromSlides = script.slides.map((s) => s.mediaId).filter((x): x is string => !!x);
        media = [...new Map([...chosen, ...fromSlides.map((id) => byId.get(id)!)].map((m) => [m.id, m])).values()];
      } else {
        script = await writeReelScript(b, args.topic, template, chosen);
      }
      script = { ...script, style: script.style ?? pickStyle(b) };
      if (template === "beforeAfter" && media.length < 2) {
        throw new ToolError("Before & After needs two photos: the before first, then the after. Pass them in media_ids.");
      }
      const now = new Date().toISOString();
      const reel: Reel = {
        id: nanoid(10),
        brandId: b.id,
        topic: args.topic.trim(),
        script,
        mediaIds: media.map((m) => m.id),
        status: "draft",
        revisions: [],
        createdAt: now,
        updatedAt: now,
      };
      await saveReel(reel);
      return { created: true, ...(await reelView(ctx, reel, b)) };
    },
  }),
  tool({
    name: "get_reel",
    title: "Get a Reel",
    description: "Get a Reel's script, status, edit link, and video export status/download link.",
    input: z.object({ reel_id: z.string() }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (ctx, { reel_id }) => {
      const { reel, brand } = await ownReel(ctx, reel_id);
      return reelView(ctx, reel, brand);
    },
  }),
  tool({
    name: "update_reel",
    title: "Edit a Reel",
    description:
      "Edit a Reel. Either pass change_request in plain language (Tadaa rewrites the script, e.g. 'make the hook funnier'), or pass script_changes with the exact fields to replace. Editing sets the Reel back to draft and clears any exported video.",
    input: z.object({
      reel_id: z.string(),
      change_request: z.string().min(2).max(500).optional(),
      script_changes: scriptInput.partial().optional().describe("Only the fields you want to replace. slides replaces all slides."),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: async (ctx, args) => {
      if (!args.change_request === !args.script_changes) throw new ToolError("Pass either change_request or script_changes (one of them).");
      const { reel, brand } = await ownReel(ctx, args.reel_id);
      const all = await listMedia(brand.id);
      const now = new Date().toISOString();
      let script: ReelScript;
      let mediaIds = reel.mediaIds;
      if (args.change_request) {
        const media = reel.mediaIds.map((id) => all.find((m) => m.id === id)).filter((m): m is MediaItem => !!m);
        script = await reviseReelScript(brand, reel.script, args.change_request.trim(), media);
      } else {
        const c = args.script_changes!;
        const merged = {
          hook: c.hook ?? reel.script.hook,
          slides: c.slides ?? reel.script.slides.map((s) => ({ text: s.text, media_id: s.mediaId })),
          cta: c.cta ?? reel.script.cta,
          caption: c.caption ?? reel.script.caption,
          hashtags: c.hashtags ?? reel.script.hashtags,
        };
        script = buildScript(reel.script.template, scriptInput.parse(merged), all);
        const used = script.slides.map((s) => s.mediaId).filter((x): x is string => !!x);
        mediaIds = [...new Set([...reel.mediaIds, ...used])];
      }
      const next: Reel = {
        ...reel,
        script,
        mediaIds,
        status: "draft",
        renderFile: undefined,
        revisions: [...reel.revisions, { request: args.change_request?.trim() ?? "Edited from Claude", at: now }],
        updatedAt: now,
      };
      await saveReel(next);
      return { updated: true, ...(await reelView(ctx, next, brand)) };
    },
  }),
  tool({
    name: "approve_reel",
    title: "Approve a Reel",
    description: "Mark a Reel as approved (ready to post), or set approved=false to move it back to draft.",
    input: z.object({ reel_id: z.string(), approved: z.boolean().optional().describe("Default true.") }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: async (ctx, { reel_id, approved }) => {
      const { reel, brand } = await ownReel(ctx, reel_id);
      const next: Reel = { ...reel, status: approved === false ? "draft" : "approved", updatedAt: new Date().toISOString() };
      await saveReel(next);
      return reelView(ctx, next, brand);
    },
  }),
  tool({
    name: "export_video",
    title: "Export video",
    description:
      "Render the Reel as a 1080×1920 MP4 and return a download link (valid 7 days). Rendering takes about 30-90 seconds; if it isn't done yet, call get_reel a little later for the link.",
    input: z.object({ reel_id: z.string() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: async (ctx, { reel_id }) => {
      const { reel, brand } = await ownReel(ctx, reel_id);
      if (!(await hasRender(reel))) {
        const job = startRender(brand, reel);
        const done = await Promise.race([
          job.then(() => true),
          new Promise<false>((r) => setTimeout(() => r(false), 50_000)),
        ]).catch((e: Error) => {
          throw new ToolError(`The video couldn't be exported: ${e.message}`);
        });
        if (!done) return reelView(ctx, reel, brand);
      }
      const fresh = (await getReel(reel.id)) ?? reel;
      return reelView(ctx, fresh, brand);
    },
  }),
];

export function toolList() {
  return TOOLS.map((t) => {
    const schema = z.toJSONSchema(t.input, { target: "draft-2020-12" }) as Record<string, unknown>;
    delete schema.$schema;
    return { name: t.name, title: t.title, description: t.description, inputSchema: schema, annotations: { title: t.title, ...t.annotations } };
  });
}

// ---------- JSON-RPC ----------

type RpcMessage = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const rpcError = (id: RpcMessage["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const rpcResult = (id: RpcMessage["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });

/** Handle one JSON-RPC message. Returns null for notifications. */
export async function handleRpc(msg: RpcMessage, ctx: Ctx) {
  const isNotification = msg.id === undefined;
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return isNotification ? null : rpcError(msg?.id, -32600, "Invalid request");
  }
  if (isNotification) return null;

  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? "");
      return rpcResult(msg.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, { tools: toolList() });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const t = TOOLS.find((x) => x.name === name);
      if (!t) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
      const parsed = t.input.safeParse(msg.params?.arguments ?? {});
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
        return rpcResult(msg.id, { isError: true, content: [{ type: "text", text: `Invalid arguments – ${issues}` }] });
      }
      try {
        const out = await t.run(ctx, parsed.data);
        return rpcResult(msg.id, {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
          structuredContent: out as Record<string, unknown>,
        });
      } catch (e) {
        const known = e instanceof ToolError || e instanceof z.ZodError;
        if (!known) console.error(`[mcp] ${name} failed`, e);
        const text = e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message;
        return rpcResult(msg.id, { isError: true, content: [{ type: "text", text: known ? text : `Something went wrong: ${text}` }] });
      }
    }
    case "resources/list":
      return rpcResult(msg.id, { resources: [] });
    case "prompts/list":
      return rpcResult(msg.id, { prompts: [] });
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
