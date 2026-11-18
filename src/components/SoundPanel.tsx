"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { soundUrl } from "@/lib/props";
import { soundMoments } from "@/lib/templates";
import type { ReelScript, SoundRef } from "@/lib/types";

type Hit = SoundRef & { preview: string };
type PackItem = { key: string; label: string; emoji: string; id: string; sound: Hit };
type Picker = { kind: "music" } | { kind: "effect"; at: string } | null;

const VOLUMES = [
  { label: "Quiet", v: 0.2 },
  { label: "Medium", v: 0.35 },
  { label: "Loud", v: 0.6 },
];

const secs = (d: number) => (d >= 60 ? `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, "0")}` : `${d.toFixed(d < 10 ? 1 : 0)}s`);

/** Reel page: background music and sound effects (CC0 sounds from Openverse). Saves right away. */
export default function SoundPanel({
  script,
  saving,
  onSave,
}: {
  script: ReelScript;
  saving: boolean;
  onSave: (patch: Pick<ReelScript, "music" | "effects">) => Promise<void>;
}) {
  const [pack, setPack] = useState<PackItem[]>([]);
  const [moods, setMoods] = useState<string[]>([]);
  const [picker, setPicker] = useState<Picker>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    api<{ pack: PackItem[]; moods: string[] }>("/api/sounds/pack")
      .then((r) => {
        setPack(r.pack);
        setMoods(r.moods);
      })
      .catch((e) => setError(e.message));
    return () => audio.current?.pause();
  }, []);

  const moments = soundMoments(script);
  const effects = script.effects ?? [];
  const effectAt = (at: string) => effects.find((e) => e.at === at);

  function play(url: string) {
    if (!audio.current) audio.current = new Audio();
    const a = audio.current;
    if (playing === url) {
      a.pause();
      setPlaying("");
      return;
    }
    a.src = url;
    a.currentTime = 0;
    a.onended = () => setPlaying("");
    a.play().catch(() => setPlaying(""));
    setPlaying(url);
  }

  async function search(query: string, kind: "music" | "effect") {
    setQ(query);
    setSearching(true);
    setError("");
    try {
      setHits(await api<Hit[]>(`/api/sounds?${new URLSearchParams({ q: query, kind })}`));
    } catch (e) {
      setError((e as Error).message);
      setHits([]);
    } finally {
      setSearching(false);
    }
  }

  function open(p: Picker) {
    setPicker(p);
    setHits(null);
    setQ("");
    if (p?.kind === "music") search(moods[0] ?? "upbeat", "music");
  }

  /** Copies the sound into Tadaa, then saves it on the Reel. */
  async function use(id: string, apply: (s: SoundRef) => Pick<ReelScript, "music" | "effects">) {
    setBusy(id);
    setError("");
    try {
      const s = await api<SoundRef>("/api/sounds", { method: "POST", json: { id } });
      await onSave(apply(s));
      setPicker(null);
      audio.current?.pause();
      setPlaying("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const setEffect = (at: string, s: SoundRef | null) => ({
    effects: [...effects.filter((e) => e.at !== at), ...(s ? [{ at, sound: s }] : [])],
  });

  /** Quick start: a whoosh on every slide and "tada" on the end card. */
  async function quickSound() {
    const whoosh = pack.find((p) => p.key === "whoosh");
    const tada = pack.find((p) => p.key === "tada");
    if (!whoosh || !tada) return;
    setBusy("quick");
    setError("");
    try {
      const [w, t] = await Promise.all([
        api<SoundRef>("/api/sounds", { method: "POST", json: { id: whoosh.id } }),
        api<SoundRef>("/api/sounds", { method: "POST", json: { id: tada.id } }),
      ]);
      const slideMoments = moments.filter((m) => /^s\d+$/.test(m.at) || m.at === "punch");
      const endMoment = moments.find((m) => m.at === "cta" || m.at === "end");
      await onSave({
        effects: [...slideMoments.map((m) => ({ at: m.at, sound: w })), ...(endMoment ? [{ at: endMoment.at, sound: t }] : [])],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const playButton = (url: string) => (
    <button
      type="button"
      onClick={() => play(url)}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-xs hover:bg-black/10"
      aria-label={playing === url ? "Stop" : "Play"}
    >
      {playing === url ? "■" : "▶"}
    </button>
  );

  const results = (kind: "music" | "effect", at?: string) => (
    <div className="mt-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search(q, kind);
        }}
      >
        <input
          className="input flex-1 py-1.5 text-sm"
          placeholder={kind === "music" ? "Search music, e.g. summer, guitar" : "Search more sounds, e.g. door bell"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn-ghost px-3 py-1.5 text-sm" disabled={searching}>
          {searching ? "…" : "Search"}
        </button>
      </form>
      {kind === "music" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {moods.map((m) => (
            <button key={m} onClick={() => search(m, "music")} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${q === m ? "bg-ink text-white" : "bg-black/5 text-ink/60 hover:bg-black/10"}`}>
              {m}
            </button>
          ))}
        </div>
      )}
      {hits && (
        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
          {!hits.length && <li className="py-2 text-sm text-ink/50">Nothing found. Try another word.</li>}
          {hits.map((h) => (
            <li key={h.id} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-black/[0.03]">
              {playButton(h.preview)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{h.title}</p>
                <p className="truncate text-xs text-ink/45">
                  {secs(h.duration)}
                  {h.creator ? ` · ${h.creator}` : ""}
                </p>
              </div>
              <button
                className="btn-primary px-3 py-1 text-sm"
                disabled={!!busy || saving}
                onClick={() => use(h.id, (s) => (kind === "music" ? { music: { ...s, volume: script.music?.volume ?? 0.35 } } : setEffect(at!, s)))}
              >
                {busy === h.id ? "…" : "Use"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">Sound</h2>
        {!effects.length && pack.length > 0 && (
          <button className="text-sm font-semibold text-coral disabled:opacity-50" disabled={!!busy || saving} onClick={quickSound}>
            {busy === "quick" ? "Adding…" : "✨ Add sound effects for me"}
          </button>
        )}
      </div>

      {/* Music */}
      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Music</p>
        {script.music ? (
          <div className="mt-2 rounded-xl bg-black/[0.03] p-3">
            <div className="flex items-center gap-2">
              {playButton(soundUrl(script.music.id))}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">🎵 {script.music.title}</p>
                <p className="text-xs text-ink/45">Loops under the whole Reel</p>
              </div>
              <button className="text-sm font-semibold text-coral" onClick={() => open(picker?.kind === "music" ? null : { kind: "music" })}>
                Change
              </button>
              <button className="text-sm text-ink/45" disabled={saving} onClick={() => onSave({ music: undefined })}>
                Remove
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1.5 pl-10">
              <span className="text-xs text-ink/45">Volume</span>
              {VOLUMES.map((v) => (
                <button
                  key={v.label}
                  disabled={saving}
                  onClick={() => onSave({ music: { ...script.music!, volume: v.v } })}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${Math.abs((script.music!.volume ?? 0.35) - v.v) < 0.01 ? "bg-ink text-white" : "bg-black/5 text-ink/60"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          picker?.kind !== "music" && (
            <button className="btn-ghost mt-2 px-3 py-1.5 text-sm" onClick={() => open({ kind: "music" })}>
              + Add background music
            </button>
          )
        )}
        {picker?.kind === "music" && results("music")}
        {script.template === "meme" && script.sound !== false && script.music && (
          <p className="mt-2 text-xs text-ink/45">The clip&rsquo;s own sound plays too. Pick “Quiet” so both can be heard.</p>
        )}
      </div>

      {/* Sound effects */}
      <div className="mt-5">
        <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Sound effects</p>
        <ul className="mt-2 space-y-1.5">
          {moments.map((m) => {
            const e = effectAt(m.at);
            const isOpen = picker?.kind === "effect" && picker.at === m.at;
            const fromPack = e && pack.find((p) => p.id === e.sound.id);
            return (
              <li key={m.at}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 text-ink/55">{m.label}</span>
                  {e ? (
                    <>
                      {playButton(soundUrl(e.sound.id))}
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {fromPack ? `${fromPack.emoji} ${fromPack.label}` : e.sound.title}
                      </span>
                      <button className="text-coral font-semibold" onClick={() => open(isOpen ? null : { kind: "effect", at: m.at })}>
                        Change
                      </button>
                      <button className="text-ink/40" disabled={saving} onClick={() => onSave(setEffect(m.at, null))} aria-label="Remove">
                        ✕
                      </button>
                    </>
                  ) : (
                    <button className="text-ink/45 font-semibold hover:text-ink" onClick={() => open(isOpen ? null : { kind: "effect", at: m.at })}>
                      {isOpen ? "Close" : "+ Add"}
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="mb-3 mt-2 rounded-xl bg-black/[0.03] p-3">
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {pack.map((p) => (
                        <div key={p.key} className="flex items-center gap-1 rounded-lg bg-white px-1.5 py-1 ring-1 ring-black/5">
                          {playButton(p.sound.preview)}
                          <button
                            className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:text-coral disabled:opacity-50"
                            disabled={!!busy || saving}
                            onClick={() => use(p.id, (s) => setEffect(m.at, s))}
                          >
                            {busy === p.id ? "…" : `${p.emoji} ${p.label}`}
                          </button>
                        </div>
                      ))}
                    </div>
                    {results("effect", m.at)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <p className="mt-4 text-xs text-ink/40">All sounds are free for commercial use (CC0), from Openverse.</p>
    </div>
  );
}
