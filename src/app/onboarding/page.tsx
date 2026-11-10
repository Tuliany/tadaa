"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { LANGUAGES, type Brand, type Language } from "@/lib/types";

export default function Onboarding() {
  const router = useRouter();
  const [website, setWebsite] = useState("");
  const [name, setName] = useState("");
  const [instagram, setInstagram] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { brand, warning } = await api<{ brand: Brand; warning?: string }>("/api/brands", {
        method: "POST",
        json: { website, name, instagram, language, notes },
      });
      router.push(`/brands/${brand.id}/edit?welcome=1${warning ? `&warning=${encodeURIComponent(warning)}` : ""}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <h1 className="text-4xl font-black tracking-tight">Let&apos;s meet your brand</h1>
      <p className="mt-2 text-ink/65">Give us your website and we&apos;ll build your brand profile in about 20 seconds. You can edit everything afterwards.</p>

      <form onSubmit={submit} className="card mt-8 p-6 space-y-5">
        <div>
          <label className="label" htmlFor="website">Website</label>
          <input id="website" className="input" placeholder="yourbusiness.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="name">Business name {website ? "(optional)" : ""}</label>
            <input id="name" className="input" placeholder="Café Lagom" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ig">Instagram (optional)</label>
            <input id="ig" className="input" placeholder="@yourbusiness" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="lang">Language for your content</label>
          <select id="lang" className="input" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            {Object.entries(LANGUAGES).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="notes">Anything we should know? (optional)</label>
          <textarea
            id="notes"
            className="input min-h-20"
            placeholder="E.g. family-run since 1998, we never use discounts, our customers are mostly young families"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {error && <p className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</p>}
        <button className="btn-primary w-full py-3 text-base" disabled={busy || (!website && !name)}>
          {busy ? "Reading your brand…" : "Build my brand profile"}
        </button>
      </form>
    </div>
  );
}
