"use client";

import { useEffect, useRef, useState } from "react";

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

/**
 * "Choose the moment": scrub a clip and set where it starts (and, with `withEnd`, where it stops).
 * The preview loops the chosen part.
 */
export default function ClipTrimmer({
  src,
  duration,
  start,
  end,
  withEnd = false,
  maxLength = 20,
  onChange,
}: {
  src: string;
  duration?: number;
  start: number;
  end?: number;
  withEnd?: boolean;
  maxLength?: number;
  onChange: (v: { start: number; end?: number }) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [len, setLen] = useState(duration ?? 0);
  const [muted, setMuted] = useState(true);
  const stop = withEnd ? (end ?? Math.min(len, start + 6)) : Math.min(len, start + 3);

  // Loop the chosen part.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const tick = () => {
      if (v.currentTime >= stop - 0.05 || v.currentTime < start - 0.3) v.currentTime = start;
    };
    v.addEventListener("timeupdate", tick);
    return () => v.removeEventListener("timeupdate", tick);
  }, [start, stop]);

  useEffect(() => {
    const v = ref.current;
    if (v && Math.abs(v.currentTime - start) > 0.2) v.currentTime = start;
  }, [start]);

  const setStart = (s: number) => {
    const st = Math.max(0, Math.min(s, Math.max(0, len - 0.5)));
    if (!withEnd) return onChange({ start: st });
    let e = end ?? st + 6;
    if (e <= st + 0.5) e = Math.min(len, st + 1);
    if (e - st > maxLength) e = st + maxLength;
    onChange({ start: st, end: Math.round(e * 10) / 10 });
  };
  const setEnd = (e: number) => {
    let st = start;
    if (e - st > maxLength) st = e - maxLength;
    if (e <= st + 0.5) st = Math.max(0, e - 1);
    onChange({ start: Math.round(st * 10) / 10, end: e });
  };

  return (
    <div className="grid sm:grid-cols-[150px_1fr] gap-4 items-center">
      <div className="relative">
        <video
          ref={ref}
          src={src}
          muted={muted}
          autoPlay
          playsInline
          loop
          className="w-[150px] aspect-[9/16] rounded-xl bg-black object-cover"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (isFinite(d)) setLen(d);
            e.currentTarget.currentTime = start;
          }}
        />
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="absolute bottom-2 right-2 rounded-full bg-black/60 text-white text-xs px-2 py-1"
          aria-label={muted ? "Unmute preview" : "Mute preview"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>
      <div className="space-y-4">
        {len > 0 ? (
          <>
            <label className="block">
              <span className="flex justify-between text-xs font-semibold text-ink/55">
                <span>Starts at</span>
                <span>{fmt(start)}</span>
              </span>
              <input type="range" className="w-full accent-coral" min={0} max={Math.max(0, len - 0.5)} step={0.1} value={start} onChange={(e) => setStart(Number(e.target.value))} />
            </label>
            {withEnd && (
              <label className="block">
                <span className="flex justify-between text-xs font-semibold text-ink/55">
                  <span>Ends at</span>
                  <span>
                    {fmt(stop)} · {(stop - start).toFixed(1)} s
                  </span>
                </span>
                <input type="range" className="w-full accent-coral" min={0.5} max={len} step={0.1} value={stop} onChange={(e) => setEnd(Number(e.target.value))} />
              </label>
            )}
            <p className="text-xs text-ink/45">
              {withEnd ? `Pick the funny bit (up to ${maxLength} s). The preview loops it.` : "Pick where this clip starts in the Reel."}
            </p>
          </>
        ) : (
          <p className="text-sm text-ink/45">Loading clip…</p>
        )}
      </div>
    </div>
  );
}
