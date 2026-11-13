import { promises as fs } from "fs";
import { nanoid } from "nanoid";
import os from "os";
import path from "path";
import { describeReference } from "@/lib/ai";
import { handle, HttpError, requireBrand } from "@/lib/auth";
import { getBrand, saveBrand } from "@/lib/db";
import { analyseVideo } from "@/lib/reference";
import type { ReferenceStyle } from "@/lib/types";

export const maxDuration = 180;

const MAX_BYTES = 150 * 1024 * 1024;
const MAX_REFS = 8;

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/brands/[id]/references">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  return Response.json(brand.references ?? []);
});

/**
 * Upload a reference video: Tadaa measures its pacing, reads a few frames with the AI and saves the look.
 * The video itself is deleted straight after.
 */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/references">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const form = await req.formData();
  const file = form.get("file");
  const url = String(form.get("url") ?? "").trim();
  if (!(file instanceof File)) throw new HttpError(400, "Upload the video you'd like to copy.");
  if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) throw new HttpError(400, "That isn't a video file. Try an MP4 or MOV.");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Please upload a video smaller than 150 MB.");

  const tmp = path.join(os.tmpdir(), `tadaa-ref-${nanoid(8)}${path.extname(file.name) || ".mp4"}`);
  await fs.writeFile(tmp, Buffer.from(await file.arrayBuffer()));
  try {
    const facts = await analyseVideo(tmp);
    const look = await describeReference(facts.frames, { duration: facts.duration, avgShotSeconds: facts.avgShotSeconds, cuts: facts.cuts.length }, brand.language);
    const ref: ReferenceStyle = {
      id: nanoid(8),
      name: look.name,
      summary: look.summary,
      base: look.base,
      overrides: look.overrides,
      avgShotSeconds: facts.avgShotSeconds,
      sourceUrl: /^https?:\/\//.test(url) ? url.slice(0, 500) : undefined,
      createdAt: new Date().toISOString(),
    };
    const latest = (await getBrand(brand.id)) ?? brand;
    await saveBrand({ ...latest, references: [ref, ...(latest.references ?? [])].slice(0, MAX_REFS) });
    return Response.json(ref);
  } catch (e) {
    console.error("[reference] analysis failed", e);
    throw new HttpError(422, (e as Error).message);
  } finally {
    fs.unlink(tmp).catch(() => {});
  }
});

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/references">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const refId = new URL(req.url).searchParams.get("refId");
  const latest = (await getBrand(brand.id)) ?? brand;
  await saveBrand({
    ...latest,
    references: (latest.references ?? []).filter((r) => r.id !== refId),
    defaultReferenceId: latest.defaultReferenceId === refId ? undefined : latest.defaultReferenceId,
  });
  return Response.json({ ok: true });
});
