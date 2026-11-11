"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { mediaUrl } from "@/lib/props";
import type { MediaItem, TemplateId } from "@/lib/types";

/** Upload photos/clips and pick them in order. */
export default function MediaPicker({
  brandId,
  template,
  selected,
  onChange,
  onError,
}: {
  brandId: string;
  template: TemplateId;
  selected: string[];
  onChange: (ids: string[]) => void;
  onError: (msg: string) => void;
}) {
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api<MediaItem[]>(`/api/brands/${brandId}/media`).then(setLibrary).catch(() => {});
  }, [brandId]);

  async function upload(files: FileList) {
    setUploading(true);
    try {
      const form = new FormData();
      [...files].forEach((f) => form.append("files", f));
      const items = await api<MediaItem[]>(`/api/brands/${brandId}/media`, { method: "POST", body: form });
      setLibrary((lib) => [...items, ...lib]);
      onChange([...selected, ...items.map((i) => i.id)]);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const input = (
    <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
  );

  if (library.length === 0) {
    return (
      <label className="card p-8 grid place-items-center text-center cursor-pointer border-dashed border-2 border-black/10 hover:border-coral/50">
        <p className="font-semibold">{uploading ? "Uploading…" : "Drop in photos or short clips"}</p>
        <p className="text-sm text-ink/55 mt-1">Shot on your phone is perfect.{template === "tips" ? " Optional for this format." : ""}</p>
        {input}
      </label>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        <label className="aspect-[3/4] rounded-xl border-2 border-dashed border-black/10 grid place-items-center text-center text-xs font-semibold text-ink/55 cursor-pointer hover:border-coral/50">
          {uploading ? "Uploading…" : "+ Upload"}
          {input}
        </label>
        {library.map((m) => {
          const n = selected.indexOf(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              className={`relative aspect-[3/4] rounded-xl overflow-hidden bg-black/5 ${n >= 0 ? "ring-3 ring-coral" : "opacity-80 hover:opacity-100"}`}
            >
              {m.kind === "video" ? (
                <video src={mediaUrl(m.id)} muted className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(m.id)} alt="" className="h-full w-full object-cover" />
              )}
              {n >= 0 && (
                <span className="absolute top-1.5 left-1.5 h-6 min-w-6 px-1.5 rounded-full bg-coral text-white text-xs font-black grid place-items-center">
                  {template === "beforeAfter" && n < 2 ? (n === 0 ? "BEFORE" : "AFTER") : n + 1}
                </span>
              )}
              {m.kind === "video" && <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 text-[10px] text-white">VIDEO</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
