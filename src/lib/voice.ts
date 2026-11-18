import { spawn } from "child_process";
import { promises as fs } from "fs";
import { nanoid } from "nanoid";
import os from "os";
import path from "path";
import { speak, transcribe, voiceEnabled } from "./elevenlabs";
import { store } from "./store";
import { localFile, saveFile } from "./storage";
import type { Brand, MediaItem, StoredVoice, VoiceTrack, VoiceWord } from "./types";

/**
 * Voices for Reels: a recorded or uploaded voiceover, an AI voice, or the speech in a Talking video.
 * Audio is normalised to MP3; words come with timings so captions follow the voice.
 */

const FFMPEG = process.env.TADAA_FFMPEG || "ffmpeg";
const FFPROBE = process.env.TADAA_FFPROBE || "ffprobe";
export const MAX_VOICE_SECONDS = 90;
export const MAX_AI_CHARS = 700;

const db = () => store();

export class VoiceError extends Error {}

function run(cmd: string, args: string[], timeoutMs = 120_000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let out = "";
    let err = "";
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d.toString().slice(-8000)));
    child.on("error", (e) => {
      clearTimeout(t);
      reject(new VoiceError(e.message.includes("ENOENT") ? "Audio processing isn't available on this server." : e.message));
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

async function durationOf(file: string) {
  const r = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  const d = parseFloat(r.out.trim());
  return isFinite(d) ? Math.round(d * 100) / 100 : 0;
}

/** Any audio or video → mono MP3 with even loudness (the voice's audio track). */
async function toMp3(input: string, output: string, maxSeconds = MAX_VOICE_SECONDS) {
  const r = await run(FFMPEG, ["-y", "-v", "error", "-i", input, "-vn", "-t", String(maxSeconds), "-ac", "1", "-ar", "44100", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-b:a", "128k", output]);
  if (r.code !== 0) throw new VoiceError("We couldn't read that audio file. Try another format (MP3, M4A or WAV).");
}

const tmp = (ext: string) => path.join(os.tmpdir(), `tadaa-voice-${nanoid(8)}.${ext}`);

export function getVoice(id: string) {
  return db().get<StoredVoice>("voices", { id });
}

async function saveVoice(v: StoredVoice) {
  await db().put("voices", v.id, v);
  return v;
}

export function toTrack(v: StoredVoice, captions = true): VoiceTrack {
  return { id: v.id, source: v.source, text: v.text, words: v.words, duration: v.duration, captions: captions && v.words.length > 0, voiceName: v.voiceName };
}

/** A recorded or uploaded voiceover: converted, stored and (when the voice service is on) transcribed. */
export async function voiceFromUpload(brand: Brand, data: Buffer, originalName: string): Promise<StoredVoice> {
  const ext = (path.extname(originalName).slice(1) || "webm").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "webm";
  const input = tmp(ext);
  const output = tmp("mp3");
  try {
    await fs.writeFile(input, data);
    await toMp3(input, output);
    const duration = await durationOf(output);
    if (duration < 0.5) throw new VoiceError("That recording is empty or too short.");
    const mp3 = await fs.readFile(output);
    let text = "";
    let words: VoiceWord[] = [];
    let language: string | undefined;
    if (voiceEnabled()) ({ text, words, language } = await transcribe(mp3, "voice.mp3", "audio/mpeg"));
    const fileName = `voice-${nanoid(10)}.mp3`;
    await saveFile("uploads", fileName, mp3);
    return saveVoice({ id: nanoid(10), brandId: brand.id, source: "recorded", fileName, mimeType: "audio/mpeg", text, words, duration, language, createdAt: new Date().toISOString() });
  } finally {
    fs.unlink(input).catch(() => {});
    fs.unlink(output).catch(() => {});
  }
}

/** An AI voice reading the text. */
export async function voiceFromText(brand: Brand, text: string, voice: { id: string; name: string }): Promise<StoredVoice> {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) throw new VoiceError("Write what the voice should say.");
  if (clean.length > MAX_AI_CHARS) throw new VoiceError(`Keep it under ${MAX_AI_CHARS} characters (about 45 seconds).`);
  const { audio, words } = await speak(clean, voice.id);
  const file = tmp("mp3");
  try {
    await fs.writeFile(file, audio);
    const duration = (await durationOf(file)) || words[words.length - 1]?.end || 0;
    const fileName = `voice-${nanoid(10)}.mp3`;
    await saveFile("uploads", fileName, audio);
    return saveVoice({ id: nanoid(10), brandId: brand.id, source: "ai", fileName, mimeType: "audio/mpeg", text: clean, words, duration, voiceId: voice.id, voiceName: voice.name, createdAt: new Date().toISOString() });
  } finally {
    fs.unlink(file).catch(() => {});
  }
}

/** Talking video: transcribes the speech in the clip (word times are from the clip's start). */
export async function voiceFromClip(brand: Brand, clip: MediaItem): Promise<StoredVoice> {
  if (clip.kind !== "video") throw new VoiceError("Pick a video.");
  const output = tmp("mp3");
  try {
    await toMp3(await localFile("uploads", clip.fileName), output, 600);
    const duration = await durationOf(output);
    const { text, words, language } = await transcribe(await fs.readFile(output), "clip.mp3", "audio/mpeg");
    return saveVoice({ id: nanoid(10), brandId: brand.id, source: "clip", mediaId: clip.id, text, words, duration, language, createdAt: new Date().toISOString() });
  } finally {
    fs.unlink(output).catch(() => {});
  }
}

/**
 * Applies an edited transcript to timed words. Same number of words: each keeps its timing.
 * Otherwise the new words are spread over the same time span, in proportion to their length.
 */
export function retime(words: VoiceWord[], text: string): VoiceWord[] {
  const next = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length || !next.length) return [];
  if (next.length === words.length) return words.map((w, i) => ({ ...w, text: next[i] }));
  const start = words[0].start;
  const end = words[words.length - 1].end;
  const total = next.reduce((n, w) => n + w.length + 1, 0);
  let t = start;
  return next.map((w) => {
    const len = ((w.length + 1) / total) * (end - start);
    const word = { text: w, start: Math.round(t * 1000) / 1000, end: Math.round((t + len * 0.92) * 1000) / 1000 };
    t += len;
    return word;
  });
}

/** Saves an edited transcript on the stored voice. */
export async function editTranscript(v: StoredVoice, text: string) {
  return saveVoice({ ...v, text: text.replace(/\s+/g, " ").trim(), words: retime(v.words, text) });
}
