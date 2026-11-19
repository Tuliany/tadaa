import type { VoiceWord } from "./types";

/**
 * ElevenLabs: speech-to-text (Scribe, word timestamps) and AI voices (text-to-speech with timing).
 * Needs ELEVENLABS_API_KEY (a paid plan: the free tier has no commercial licence).
 */

const API = "https://api.elevenlabs.io/v1";
const STT_MODEL = process.env.ELEVENLABS_STT_MODEL || "scribe_v2";
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2";

export class VoiceServiceError extends Error {}

export const voiceEnabled = () => !!process.env.ELEVENLABS_API_KEY;

function key() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new VoiceServiceError("Voice features aren't switched on yet (ElevenLabs isn't connected).");
  return k;
}

async function fail(res: Response, what: string): Promise<never> {
  const body = await res.text().catch(() => "");
  console.error(`[elevenlabs] ${what} ${res.status}: ${body.slice(0, 400)}`);
  if (res.status === 401) throw new VoiceServiceError("The voice service rejected our key. Check ELEVENLABS_API_KEY.");
  if (res.status === 429) throw new VoiceServiceError("The voice service is busy. Try again in a minute.");
  if (/quota|credits/i.test(body)) throw new VoiceServiceError("The voice service has run out of credits.");
  throw new VoiceServiceError(`${what} failed (${res.status}). Please try again.`);
}

/** Transcribes an audio/video file. Returns the text and its words with timings. */
export async function transcribe(file: Buffer, fileName: string, mimeType: string): Promise<{ text: string; words: VoiceWord[]; language?: string }> {
  const form = new FormData();
  form.append("model_id", STT_MODEL);
  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "false");
  form.append("file", new Blob([new Uint8Array(file)], { type: mimeType }), fileName);
  const res = await fetch(`${API}/speech-to-text`, { method: "POST", headers: { "xi-api-key": key() }, body: form });
  if (!res.ok) return fail(res, "Transcription");
  const j = (await res.json()) as { text?: string; language_code?: string; words?: { text: string; start?: number | null; end?: number | null; type?: string }[] };
  const words = (j.words ?? [])
    .filter((w) => (w.type ?? "word") === "word" && w.text.trim() && w.start != null && w.end != null)
    .map((w) => ({ text: w.text.trim(), start: round(w.start!), end: round(w.end!) }));
  return { text: (j.text ?? words.map((w) => w.text).join(" ")).trim(), words, language: j.language_code };
}

export interface AiVoice {
  id: string;
  name: string;
  /** e.g. "female · young · warm" */
  description: string;
  preview?: string;
}

let voicesCache: { at: number; list: AiVoice[] } | null = null;

/** The voices available on the account (ElevenLabs' ready-made voices plus any added in the account). */
export async function listVoices(): Promise<AiVoice[]> {
  if (voicesCache && Date.now() - voicesCache.at < 3600_000) return voicesCache.list;
  const res = await fetch(`${API}/voices`, { headers: { "xi-api-key": key() } });
  if (!res.ok) return fail(res, "Loading voices");
  const j = (await res.json()) as { voices: { voice_id: string; name: string; labels?: Record<string, string>; preview_url?: string; category?: string }[] };
  const list = j.voices
    .map((v) => ({
      id: v.voice_id,
      name: v.name.split(/\s+-\s+/)[0],
      description: [v.labels?.gender, v.labels?.age, v.labels?.descriptive ?? v.labels?.description, v.labels?.accent]
        .filter(Boolean)
        .map((l) => l!.replace(/_/g, " "))
        .join(" · "),
      preview: v.preview_url,
    }))
    .slice(0, 40);
  voicesCache = { at: Date.now(), list };
  return list;
}

/** Speaks the text with an AI voice. Returns MP3 audio and the words with timings. */
export async function speak(text: string, voiceId: string): Promise<{ audio: Buffer; words: VoiceWord[] }> {
  if (!/^[A-Za-z0-9]{8,40}$/.test(voiceId)) throw new VoiceServiceError("Pick a voice.");
  const res = await fetch(`${API}/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key(), "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: TTS_MODEL }),
  });
  if (!res.ok) return fail(res, "Creating the voice");
  const j = (await res.json()) as {
    audio_base64: string;
    alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } | null;
  };
  return { audio: Buffer.from(j.audio_base64, "base64"), words: j.alignment ? wordsFromCharacters(j.alignment) : [] };
}

/** Groups character timings into words. */
export function wordsFromCharacters(a: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): VoiceWord[] {
  const words: VoiceWord[] = [];
  let cur: VoiceWord | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      return;
    }
    const start = a.character_start_times_seconds[i] ?? 0;
    const end = a.character_end_times_seconds[i] ?? start;
    if (!cur) cur = { text: ch, start: round(start), end: round(end) };
    else {
      cur.text += ch;
      cur.end = round(end);
    }
  });
  if (cur) words.push(cur);
  return words;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
