"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { mediaUrl } from "@/lib/props";
import { LANGUAGES, type Brand, type Language, type MediaItem } from "@/lib/types";

function ListField({ label, value, onChange, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; hint: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea className="input min-h-24" value={value.join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} />
      <p className="text-xs text-ink/45 mt-1">{hint}</p>
    </div>
  );
}

function EditBrand() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Brand>(`/api/brands/${id}`).then(setBrand).catch((e) => setError(e.message));
  }, [id]);

  if (!brand) return <p className="text-ink/50">{error || "Loading…"}</p>;

  const set = <K extends keyof Brand>(key: K, value: Brand[K]) => setBrand({ ...brand, [key]: value });

  async function uploadLogo(file: File) {
    const form = new FormData();
    form.append("files", file);
    const [item] = await api<MediaItem[]>(`/api/brands/${id}/media`, { method: "POST", body: form });
    set("logoUrl", mediaUrl(item.id));
  }

  async function save() {
    if (!brand) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/brands/${id}`, {
        method: "PUT",
        json: {
          ...brand,
          offers: brand.offers.filter(Boolean),
          claimsToAvoid: brand.claimsToAvoid.filter(Boolean),
          referenceReels: (brand.referenceReels ?? []).map((r) => r.trim()).filter(Boolean),
        },
      });
      router.push(`/brands/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      {params.get("welcome") && (
        <div className="mb-6 rounded-2xl bg-sun/20 px-5 py-4">
          <p className="font-bold">Here&apos;s your brand profile 🎉</p>
          <p className="text-sm text-ink/70">Check it over – Tadaa follows this for every Reel. Fix anything that&apos;s off, then save.</p>
        </div>
      )}
      {params.get("warning") && <p className="mb-6 rounded-xl bg-orange-50 text-orange-800 text-sm px-4 py-3">{params.get("warning")}</p>}

      <h1 className="text-3xl font-black tracking-tight">Brand Brain</h1>
      <p className="mt-1 text-ink/60">Tadaa follows this for every Reel.</p>

      <div className="card mt-6 p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={brand.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className="label">Industry</label>
            <input className="input" value={brand.industry} onChange={(e) => set("industry", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">What you do</label>
          <textarea className="input min-h-20" value={brand.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Who your customers are</label>
            <textarea className="input min-h-20" value={brand.audience} onChange={(e) => set("audience", e.target.value)} />
          </div>
          <div>
            <label className="label">Tone of voice</label>
            <textarea className="input min-h-20" value={brand.voice} onChange={(e) => set("voice", e.target.value)} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <ListField label="Products & services" value={brand.offers} onChange={(v) => set("offers", v)} hint="One per line" />
          <ListField label="Never claim" value={brand.claimsToAvoid} onChange={(v) => set("claimsToAvoid", v)} hint="One per line, e.g. prices, guarantees" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Content language</label>
            <select className="input" value={brand.language} onChange={(e) => set("language", e.target.value as Language)}>
              {Object.entries(LANGUAGES).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Instagram</label>
            <input className="input" value={brand.instagram ?? ""} onChange={(e) => set("instagram", e.target.value)} />
          </div>
        </div>
        <ListField
          label="Reels you like"
          value={brand.referenceReels ?? []}
          onChange={(v) => set("referenceReels", v)}
          hint="One link per line – style references for your content"
        />
      </div>

      <div className="card mt-6 p-6">
        <h2 className="font-bold text-lg">Look</h2>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(["primary", "secondary", "text", "background"] as const).map((k) => (
            <div key={k}>
              <label className="label capitalize">{k}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-10 w-12 rounded-lg border border-black/10 bg-white p-1"
                  value={brand.colors[k]}
                  onChange={(e) => set("colors", { ...brand.colors, [k]: e.target.value })}
                />
                <span className="text-xs font-mono text-ink/55">{brand.colors[k]}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-5">
          <div className="h-20 w-20 rounded-2xl border border-black/10 bg-white grid place-items-center overflow-hidden">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain p-2" />
            ) : (
              <span className="text-xs text-ink/40">No logo</span>
            )}
          </div>
          <label className="btn-ghost cursor-pointer">
            Upload logo
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
          </label>
          {brand.logoUrl && (
            <button className="text-sm text-ink/55 underline" onClick={() => set("logoUrl", undefined)}>
              Remove
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-ghost" onClick={() => router.push(`/brands/${id}`)}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <EditBrand />
    </Suspense>
  );
}
