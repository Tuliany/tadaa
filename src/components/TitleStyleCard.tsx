"use client";

import { useEffect, useState } from "react";
import { styleOf } from "@/lib/styles";
import type { Brand, ReelScript, TitleStyle } from "@/lib/types";

const SIZES: { id: NonNullable<TitleStyle["size"]>; label: string }[] = [
  { id: "s", label: "S" },
  { id: "m", label: "M" },
  { id: "l", label: "L" },
  { id: "xl", label: "XL" },
];

const FONTS: { id: NonNullable<TitleStyle["font"]>; label: string; css: string }[] = [
  { id: "inter", label: "Clean", css: "'Inter', sans-serif" },
  { id: "montserrat", label: "Modern", css: "'Montserrat', sans-serif" },
  { id: "bebas", label: "Tall", css: "'Bebas Neue', sans-serif" },
  { id: "nunito", label: "Friendly", css: "'Nunito', sans-serif" },
  { id: "playfair", label: "Elegant", css: "'Playfair Display', serif" },
  { id: "dmSerif", label: "Classic", css: "'DM Serif Display', serif" },
];

/** Meme caption / Talking video title: size, font, colours and capitals, chosen by the customer. Saves right away. */
export default function TitleStyleCard({
  script,
  brand,
  saving,
  onSave,
}: {
  script: ReelScript;
  brand: Brand;
  saving: boolean;
  onSave: (titleStyle: TitleStyle | null) => void;
}) {
  const t = script.titleStyle ?? {};
  // What the brand look uses when nothing is chosen.
  const base = styleOf(script);
  const isMeme = script.template === "meme";
  const set = (patch: Partial<TitleStyle>) => onSave({ ...t, ...patch });
  // The colour picker fires while dragging: save once it settles.
  const [pending, setLater] = useState<Partial<TitleStyle> | null>(null);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      onSave({ ...(script.titleStyle ?? {}), ...pending });
      setLater(null);
    }, 500);
    return () => clearTimeout(timer);
  }, [pending, onSave, script.titleStyle]);
  const swatches = [...new Set([brand.colors.primary, brand.colors.secondary, "#ffffff", "#111111", "#ffd93b", "#e63946", "#2a9d8f"].filter(Boolean).map((c) => c!.toLowerCase()))];
  const defaultBg = isMeme ? "#ffffff" : brand.colors.primary.toLowerCase();

  const colorRow = (label: string, value: string | undefined, fallback: string, onPick: (c: string) => void, onDrag: (c: string) => void, allowNone = false) => (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-ink/45">{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {allowNone && (
          <button
            disabled={saving}
            onClick={() => onPick("none")}
            title="No box"
            className={`h-8 rounded-full px-3 text-xs font-semibold ring-1 ${value === "none" ? "bg-ink text-white ring-ink" : "ring-black/15 text-ink/60"}`}
          >
            None
          </button>
        )}
        {swatches.map((c) => (
          <button
            key={c}
            disabled={saving}
            onClick={() => onPick(c)}
            title={c}
            className={`h-8 w-8 rounded-full ring-1 ring-black/15 ${(value ?? fallback) === c ? "outline outline-2 outline-offset-2 outline-coral" : ""}`}
            style={{ background: c }}
          />
        ))}
        <label className="relative flex h-8 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-semibold text-ink/60 ring-1 ring-black/15" title="Pick any colour">
          🎨 Other
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={value && value !== "none" ? value : fallback}
            onChange={(e) => onDrag(e.target.value)}
          />
        </label>
      </div>
    </div>
  );

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{isMeme ? "Caption style" : "Title style"}</h2>
        {script.titleStyle && (
          <button className="text-sm text-ink/45" disabled={saving} onClick={() => onSave(null)}>
            Reset
          </button>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Size</p>
          <div className="mt-1.5 flex gap-1.5">
            {SIZES.map((s) => (
              <button
                key={s.id}
                disabled={saving}
                onClick={() => set({ size: s.id })}
                className={`h-8 min-w-10 rounded-full px-3 text-sm font-bold ${(t.size ?? "m") === s.id ? "bg-ink text-white" : "bg-black/5 text-ink/60 hover:bg-black/10"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Font</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {FONTS.map((f) => (
              <button
                key={f.id}
                disabled={saving}
                onClick={() => set({ font: f.id })}
                className={`rounded-lg px-2 py-2 text-base ring-1 ${(t.font ?? base.font) === f.id ? "bg-coral/10 ring-coral" : "ring-black/10 hover:bg-black/[0.03]"}`}
                style={{ fontFamily: f.css, fontWeight: f.id === "bebas" || f.id === "dmSerif" ? 400 : 800 }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {colorRow("Text colour", t.color, isMeme ? "#111111" : "#ffffff", (c) => set({ color: c }), (c) => setLater({ color: c }))}
        {colorRow(
          isMeme ? "Caption background" : "Box colour",
          t.background,
          defaultBg,
          (c) => set({ background: c }),
          (c) => setLater({ background: c }),
          !isMeme,
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={t.upper ?? base.upper} disabled={saving} onChange={(e) => set({ upper: e.target.checked })} />
          CAPITAL LETTERS
        </label>
      </div>
    </div>
  );
}
