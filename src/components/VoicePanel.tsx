"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { voiceUrl } from "@/lib/props";
import type { Reel } from "@/lib/types";

type AiVoice = { id: string; name: string; description: string; preview?: string };
type Mode = "record" | "upload" | "ai";

const SOURCE_LABEL = { recorded: "Your voiceover", ai: "AI voice", clip: "Speech in the video" } as const;
const MAX_RECORD_SECONDS = 90;

/** Reel page: voiceover (record / upload / AI voice) or Talking video captions, with an editable transcript. */
export default function VoicePanel({ reel, onChange }: { reel: Reel; onChange: (r: Reel) => void }) {
  const voice = reel.script.voice;
  const isTalk = reel.script.template === "talk";
  const [info, setInfo] = useState<{ enabled: boolean; voices: AiVoice[]; maxChars: number; error?: string } | null>(null);
  const [mode, setMode] = useState<Mode>("record");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  // Captions being edited (null = showing the saved text).
  const [draft, setDraft] = useState<string | null>(null);
  const transcript = draft ?? voice?.text ?? "";
  const [aiText, setAiText] = useState("");
  const [aiVoice, setAiVoice] = useState("");
  // Recording
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; url: string } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState("");

  useEffect(() => {
    api<{ enabled: boolean; voices: AiVoice[]; maxChars: number; error?: string }>(`/api/reels/${reel.id}/voice`)
      .then((r) => {
        setInfo(r);
        if (r.voices[0]) setAiVoice((v) => v || r.voices[0].id);
      })
      .catch(() => setInfo({ enabled: false, voices: [], maxChars: 700 }));
    return () => {
      player.current?.pause();
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, [reel.id]);

  function play(url: string) {
    if (!player.current) player.current = new Audio();
    const a = player.current;
    if (playing === url) {
      a.pause();
      setPlaying("");
      return;
    }
    a.src = url;
    a.onended = () => setPlaying("");
    a.play().catch(() => setPlaying(""));
    setPlaying(url);
  }

  async function act(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    setError("");
    setNote("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        setTake({ blob, url: URL.createObjectURL(blob) });
        setRecording(false);
        if (timer.current) clearInterval(timer.current);
      };
      recorder.current = rec;
      rec.start(250);
      setTake(null);
      setSeconds(0);
      setRecording(true);
      const t0 = Date.now();
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        setSeconds(s);
        if (s >= MAX_RECORD_SECONDS && rec.state === "recording") rec.stop();
      }, 250);
    } catch {
      setError("We couldn't use your microphone. Allow microphone access in the browser and try again.");
    }
  }

  const stopRecording = () => recorder.current?.state === "recording" && recorder.current.stop();

  async function upload(file: Blob, name: string) {
    await act("upload", async () => {
      const form = new FormData();
      form.append("file", file, name);
      const res = await fetch(`/api/reels/${reel.id}/voice`, { method: "POST", body: form });
      const j = (await res.json()) as { reel?: Reel; transcribed?: boolean; error?: string };
      if (!res.ok || !j.reel) throw new Error(j.error || "Upload failed. Please try again.");
      onChange(j.reel);
      setTake(null);
      if (!j.transcribed) setNote(info?.enabled ? "We couldn't hear any words, so there are no captions." : "Added. Captions appear once voice transcription is switched on.");
    });
  }

  const ext = (b: Blob) => (b.type.includes("mp4") ? "m4a" : b.type.includes("ogg") ? "ogg" : "webm");

  const patch = (body: Record<string, unknown>) =>
    act("save", async () => {
      onChange(await api<Reel>(`/api/reels/${reel.id}/voice`, { method: "PATCH", json: body }));
      if ("text" in body) setDraft(null);
    });

  const tabs: { id: Mode; label: string; disabled?: boolean }[] = [
    { id: "record", label: "🎙️ Record" },
    { id: "upload", label: "⬆️ Upload" },
    { id: "ai", label: "🤖 AI voice", disabled: !info?.enabled },
  ];

  return (
    <div className="card p-5">
      <h2 className="font-bold">{isTalk ? "Captions" : "Voice"}</h2>

      {voice ? (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-black/[0.03] p-3">
            {voice.source !== "clip" && (
              <button
                onClick={() => play(voiceUrl(voice.id))}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-xs hover:bg-black/10"
                aria-label="Play"
              >
                {playing === voiceUrl(voice.id) ? "■" : "▶"}
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {SOURCE_LABEL[voice.source]}
                {voice.voiceName ? ` · ${voice.voiceName}` : ""}
              </p>
              <p className="text-xs text-ink/45">
                {Math.round(voice.duration)} s{voice.words.length ? ` · ${voice.words.length} words` : " · no captions"}
              </p>
            </div>
            {voice.source !== "clip" ? (
              <button className="text-sm text-ink/45" disabled={!!busy} onClick={() => act("remove", async () => onChange(await api<Reel>(`/api/reels/${reel.id}/voice`, { method: "DELETE" })))}>
                {busy === "remove" ? "…" : "Remove"}
              </button>
            ) : (
              info?.enabled && (
                <button className="text-sm font-semibold text-coral" disabled={!!busy} onClick={() => act("transcribe", async () => onChange((await api<{ reel: Reel }>(`/api/reels/${reel.id}/voice`, { method: "POST", json: { action: "transcribe" } })).reel))}>
                  {busy === "transcribe" ? "Listening…" : "Transcribe again"}
                </button>
              )
            )}
          </div>

          {voice.words.length > 0 && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={voice.captions} disabled={!!busy} onChange={(e) => patch({ captions: e.target.checked })} />
                <span>
                  Show captions word by word
                  {!isTalk && <span className="text-ink/45"> (replaces the slide text)</span>}
                </span>
              </label>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Captions text</p>
                <textarea className="input mt-1 min-h-24 text-sm" value={transcript} onChange={(e) => setDraft(e.target.value)} />
                {draft !== null && draft.trim() !== voice.text && (
                  <div className="mt-1 flex justify-end gap-3 text-sm">
                    <button className="text-ink/50" onClick={() => setDraft(null)}>
                      Undo
                    </button>
                    <button className="font-bold text-coral" disabled={!!busy} onClick={() => patch({ text: transcript })}>
                      {busy === "save" ? "Saving…" : "Save captions"}
                    </button>
                  </div>
                )}
                <p className="mt-1 text-xs text-ink/40">Fix misheard words here. Keeping the same number of words keeps the timing exact.</p>
              </div>
            </>
          )}
        </div>
      ) : isTalk ? (
        <div className="mt-3 text-sm">
          {info?.enabled ? (
            <button className="btn-primary px-4 py-2" disabled={!!busy} onClick={() => act("transcribe", async () => onChange((await api<{ reel: Reel }>(`/api/reels/${reel.id}/voice`, { method: "POST", json: { action: "transcribe" } })).reel))}>
              {busy === "transcribe" ? "Listening to the video…" : "Add captions from the video"}
            </button>
          ) : (
            <p className="text-ink/55">Captions from speech aren&rsquo;t switched on yet.</p>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                disabled={t.disabled}
                onClick={() => setMode(t.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${mode === t.id ? "bg-ink text-white" : "bg-black/5 text-ink/60 hover:bg-black/10"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {mode === "record" && (
            <div className="mt-3 text-sm">
              <p className="text-ink/55">Talk about what&rsquo;s in the Reel. The slides stretch to fit, and captions follow your words.</p>
              <div className="mt-3 flex items-center gap-3">
                {recording ? (
                  <button className="btn-primary px-4 py-2" onClick={stopRecording}>
                    ■ Stop · {seconds}s
                  </button>
                ) : (
                  <button className="btn-dark px-4 py-2" disabled={!!busy} onClick={startRecording}>
                    ● {take ? "Record again" : "Start recording"}
                  </button>
                )}
                {recording && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />}
              </div>
              {take && !recording && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <audio src={take.url} controls className="h-9" />
                  <button className="btn-primary px-4 py-2" disabled={!!busy} onClick={() => upload(take.blob, `recording.${ext(take.blob)}`)}>
                    {busy === "upload" ? "Adding…" : "Use this recording"}
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === "upload" && (
            <div className="mt-3 text-sm">
              <p className="text-ink/55">An audio file with your voice (MP3, M4A, WAV…), up to 90 seconds. Only use music you have the rights to.</p>
              <label className="btn-dark mt-3 inline-block cursor-pointer px-4 py-2">
                {busy === "upload" ? "Uploading…" : "Choose a file"}
                <input
                  type="file"
                  accept="audio/*,video/mp4,video/quicktime"
                  className="hidden"
                  disabled={!!busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f, f.name);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          )}

          {mode === "ai" && info?.enabled && (
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink/45">What the voice says</p>
                  <button
                    className="text-sm font-semibold text-coral"
                    disabled={!!busy}
                    onClick={() => act("script", async () => setAiText((await api<{ text: string }>(`/api/reels/${reel.id}/voice`, { method: "POST", json: { action: "script" } })).text))}
                  >
                    {busy === "script" ? "Writing…" : "✨ Write it for me"}
                  </button>
                </div>
                <textarea className="input mt-1 min-h-28" value={aiText} maxLength={info.maxChars} onChange={(e) => setAiText(e.target.value)} placeholder="Every morning at six we bake our cinnamon buns by hand…" />
                <p className="text-right text-xs text-ink/40">
                  {aiText.length}/{info.maxChars}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Voice</p>
                <div className="mt-1 grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                  {info.voices.map((v) => (
                    <label key={v.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 ring-1 ${aiVoice === v.id ? "bg-coral/10 ring-coral" : "ring-black/5 hover:bg-black/[0.03]"}`}>
                      <input type="radio" name="ai-voice" className="hidden" checked={aiVoice === v.id} onChange={() => setAiVoice(v.id)} />
                      {v.preview && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            play(v.preview!);
                          }}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/5 text-[10px]"
                          aria-label={`Hear ${v.name}`}
                        >
                          {playing === v.preview ? "■" : "▶"}
                        </button>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{v.name}</span>
                        <span className="block truncate text-xs text-ink/45">{v.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {info.error && <p className="mt-1 text-xs text-red-700">{info.error}</p>}
                <p className="mt-1 text-xs text-ink/40">Voice samples are in English; every voice speaks your Reel&rsquo;s language.</p>
              </div>
              <button
                className="btn-primary px-4 py-2"
                disabled={!!busy || !aiText.trim() || !aiVoice}
                onClick={() =>
                  act("ai", async () => onChange((await api<{ reel: Reel }>(`/api/reels/${reel.id}/voice`, { method: "POST", json: { action: "ai", text: aiText, voiceId: aiVoice } })).reel))
                }
              >
                {busy === "ai" ? "Creating the voice…" : "Create voice"}
              </button>
            </div>
          )}

          {info && !info.enabled && (
            <p className="mt-3 text-xs text-ink/45">AI voices and captions switch on once the voice service is connected. Recordings work already (without captions).</p>
          )}
        </div>
      )}

      {note && <p className="mt-3 text-sm text-ink/60">{note}</p>}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
