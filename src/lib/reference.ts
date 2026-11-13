import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

/** Full ffmpeg (Remotion's bundled one lacks the scene filter). Installed in the Docker image. */
const FFMPEG = process.env.TADAA_FFMPEG || "ffmpeg";
const FFPROBE = process.env.TADAA_FFPROBE || "ffprobe";

function run(cmd: string, args: string[], timeoutMs = 90_000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let out = "";
    let err = "";
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d.toString().slice(-20000)));
    child.on("error", (e) => {
      clearTimeout(t);
      reject(new Error(e.message.includes("ENOENT") ? "Video analysis isn't available on this server yet." : e.message));
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

/** Length of a video in seconds, or undefined if it can't be read. */
export async function probeDuration(file: string): Promise<number | undefined> {
  try {
    const r = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], 20_000);
    const d = Number(r.out.trim());
    return isFinite(d) && d > 0 ? Math.round(d * 100) / 100 : undefined;
  } catch {
    return undefined;
  }
}

export interface VideoFacts {
  duration: number;
  /** Times (s) where the shot changes. */
  cuts: number[];
  avgShotSeconds: number | null;
  /** Small JPEG frames spread over the video. */
  frames: Buffer[];
}

/** Finds the cuts and grabs a handful of frames for the AI to look at. */
export async function analyseVideo(file: string): Promise<VideoFacts> {
  const probe = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], 30_000);
  const duration = Number(probe.out.trim());
  if (!isFinite(duration) || duration <= 0) throw new Error("That file doesn't look like a video we can read. Try an MP4 or MOV.");
  if (duration > 180) throw new Error("Please upload a video shorter than 3 minutes.");

  // Scene changes: ffmpeg prints a showinfo line (with pts_time) for each frame that differs strongly from the last.
  const sc = await run(FFMPEG, ["-hide_banner", "-i", file, "-an", "-vf", "scale=320:-2,select='gt(scene,0.32)',showinfo", "-f", "null", "-"], 120_000);
  const cuts = [...sc.err.matchAll(/pts_time:([\d.]+)/g)]
    .map((m) => Number(m[1]))
    .filter((t, i, a) => t > 0.2 && t < duration - 0.2 && (i === 0 || t - a[i - 1] > 0.25));
  const shots = cuts.length + 1;
  const avgShotSeconds = cuts.length ? Math.round((duration / shots) * 10) / 10 : null;

  // Six frames: a bit after the start, then spread out (shot midpoints when we have cuts).
  const bounds = [0, ...cuts, duration];
  const mids = bounds.slice(0, -1).map((b, i) => (b + bounds[i + 1]) / 2);
  const picks = (mids.length >= 6 ? [0, 0.2, 0.4, 0.6, 0.8, 0.99].map((f) => mids[Math.floor(f * (mids.length - 1))]) : [0.08, 0.25, 0.42, 0.58, 0.75, 0.92].map((f) => f * duration))
    .map((t) => Math.min(Math.max(t, 0.1), duration - 0.1));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tadaa-ref-"));
  const frames: Buffer[] = [];
  try {
    for (const [i, t] of picks.entries()) {
      const out = path.join(dir, `f${i}.jpg`);
      const r = await run(FFMPEG, ["-hide_banner", "-v", "error", "-ss", t.toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=432:-2", "-q:v", "4", out], 30_000);
      if (r.code === 0) frames.push(await fs.readFile(out).catch(() => Buffer.alloc(0)));
    }
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  const good = frames.filter((f) => f.length > 0);
  if (!good.length) throw new Error("We couldn't read frames from that video. Try an MP4 or MOV.");
  return { duration, cuts, avgShotSeconds, frames: good };
}
