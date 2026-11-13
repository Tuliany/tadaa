"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, apiStream } from "@/lib/client";
import { LANGUAGES, type Brand, type Language } from "@/lib/types";

type Scan = {
  url: string;
  name: string;
  headline: string;
  description: string;
  colors: string[];
  logoUrl?: string;
  heroImage?: string;
};

type Stage = "form" | "reading" | "done";

function Shimmer({ w = "w-2/3" }: { w?: string }) {
  return <div className={`h-5 ${w} rounded-md bg-black/5 animate-pulse`} />;
}

function KitRow({ label, children, show }: { label: string; children: React.ReactNode; show: boolean }) {
  return (
    <div className={`transition-all duration-500 ${show ? "opacity-100 translate-y-0" : "opacity-60"}`}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink/40">{label}</p>
      <div className="mt-1.5 text-lg font-semibold">{children}</div>
    </div>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("form");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [reels, setReels] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [scan, setScan] = useState<Scan | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  // The brand as it's being written (streamed), shown until the final brand arrives.
  const [draft, setDraft] = useState<Partial<Brand> | null>(null);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  // Rotating status line while Claude reads the site.
  useEffect(() => {
    if (stage !== "reading") return;
    const t = setInterval(() => setTick((n) => n + 1), 2200);
    return () => clearInterval(t);
  }, [stage]);
  const steps = ["Reading your pages…", "Finding what you sell…", "Learning how you talk…", "Picking your colours…", "Writing your brand brain…"];

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setWarning("");
    setScan(null);
    setBrand(null);
    setDraft(null);
    setStage("reading");
    const referenceReels = reels.split(/\s+/).filter((r) => /^https?:\/\//.test(r));
    try {
      if (website.trim()) {
        api<Scan>("/api/onboarding/scan", { method: "POST", json: { website } })
          .then(setScan)
          .catch((err) => setWarning(err.message));
      }
      const res = await apiStream<{ brand: Brand; warning?: string }, Partial<Brand>>(
        "/api/brands",
        { method: "POST", json: { website, description, referenceReels, language } },
        setDraft,
      );
      if (res.warning) setWarning(res.warning);
      setBrand(res.brand);
      setStage("done");
    } catch (err) {
      setError((err as Error).message);
      setStage("form");
    }
  }

  if (stage === "form") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-14">
        <p className="text-sm font-bold uppercase tracking-widest text-coral">Step 1 of 2</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Where does your brand live?</h1>
        <p className="mt-2 text-ink/65">Tadaa reads your website and learns how you look and sound. Takes about 20 seconds.</p>

        <form onSubmit={start} className="card mt-8 p-6 space-y-6">
          <div>
            <label className="label" htmlFor="website">Your website</label>
            <input id="website" className="input text-base" placeholder="yourbusiness.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="desc">What do you do, and for whom?</label>
            <textarea
              id="desc"
              className="input min-h-24 text-base"
              placeholder="E.g. We find and manage furnished housing for companies with staff on temporary projects across Sweden."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="text-xs text-ink/45 mt-1">A sentence or two is plenty. No website? This is enough on its own.</p>
          </div>
          <div>
            <label className="label" htmlFor="reels">Reels you like (optional)</label>
            <textarea
              id="reels"
              className="input min-h-16"
              placeholder="Paste up to 6 links to Reels or TikToks whose style you'd like to match"
              value={reels}
              onChange={(e) => setReels(e.target.value)}
            />
          </div>
          <div className="sm:w-1/2">
            <label className="label" htmlFor="lang">Language for your content</label>
            <select id="lang" className="input" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              {Object.entries(LANGUAGES).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
          {error && <p className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</p>}
          <button className="btn-dark px-8 py-3 text-base" disabled={!website.trim() && !description.trim()}>
            Start →
          </button>
        </form>
      </div>
    );
  }

  const host = (scan?.url || website).replace(/^https?:\/\//, "").replace(/\/$/, "");
  const kit: Partial<Brand> | null = brand ?? draft;
  const hex = (c?: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : undefined);
  const kitColors = [hex(kit?.colors?.primary), hex(kit?.colors?.secondary), hex(kit?.colors?.background)].filter((c): c is string => !!c);
  const colors = kitColors.length ? kitColors : scan?.colors ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-center text-4xl md:text-5xl font-black tracking-tight">
        {stage === "done" ? "Meet your brand" : "Reading"} {host && <span className="italic text-coral">{host}</span>}
      </h1>
      <p className="mt-3 text-center text-ink/55 h-6">{stage === "reading" ? steps[tick % steps.length] : "Here's what Tadaa learned. You can change anything later."}</p>

      <div className="mt-10 grid lg:grid-cols-[1.2fr_1fr] gap-6 lg:items-start">
        {/* Website preview */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-black/5 px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-black/10" />
            <span className="h-3 w-3 rounded-full bg-black/10" />
            <span className="h-3 w-3 rounded-full bg-black/10" />
            <span className="ml-3 flex-1 rounded-full bg-black/5 px-4 py-1 text-center text-sm text-ink/55 truncate">{host || "your business"}</span>
          </div>
          <div className="relative aspect-[16/10] bg-cream">
            {scan?.heroImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={scan.heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <div className="h-16 w-16 rounded-full border-4 border-coral/30 border-t-coral animate-spin" />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-6">
              {scan?.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scan.logoUrl} alt="" className="mb-3 h-10 w-auto rounded bg-white/90 p-1" />
              )}
              <p className="text-white text-2xl md:text-3xl font-black leading-tight drop-shadow">{scan?.headline || brand?.headline || ""}</p>
            </div>
          </div>
        </div>

        {/* Brand kit */}
        <div className="card p-7 space-y-5">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-coral">Your brand kit</p>
          <KitRow label="Name" show={!!(kit?.name || scan)}>{kit?.name || scan?.name || <Shimmer w="w-1/2" />}</KitRow>
          <KitRow label="Headline" show={!!(scan?.headline || brand?.headline)}>
            {scan?.headline || brand?.headline ? `“${scan?.headline || brand?.headline}”` : stage === "reading" ? <Shimmer /> : <span className="text-ink/40">–</span>}
          </KitRow>
          <KitRow label="What you do" show={!!kit?.description}>
            {kit?.description ? <span className="text-base font-medium text-ink/80">{kit.description}</span> : <Shimmer w="w-full" />}
          </KitRow>
          <KitRow label="Tone of voice" show={!!kit?.voice}>{kit?.voice || <Shimmer w="w-1/2" />}</KitRow>
          <KitRow label="Colours" show={colors.length > 0}>
            {colors.length ? (
              <div className="flex gap-2">
                {colors.map((c) => (
                  <span key={c} className="h-9 w-9 rounded-full ring-1 ring-black/10" style={{ background: c }} title={c} />
                ))}
              </div>
            ) : (
              <Shimmer w="w-1/3" />
            )}
          </KitRow>
          {(kit?.offers?.filter(Boolean).length ?? 0) > 0 && (
            <KitRow label="What you offer" show>
              <div className="flex flex-wrap gap-2">
                {kit!.offers!.filter(Boolean).slice(0, 6).map((o) => (
                  <span key={o} className="rounded-full bg-cream px-3 py-1 text-sm font-medium">{o}</span>
                ))}
              </div>
            </KitRow>
          )}
        </div>
      </div>

      {warning && <p className="mt-6 rounded-xl bg-orange-50 text-orange-800 text-sm px-4 py-3">{warning}</p>}

      {stage === "done" && brand && (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={`/brands/${brand.id}/edit`} className="btn-ghost px-6 py-3">Adjust the brand</Link>
          <button className="btn-primary px-8 py-3 text-base" onClick={() => router.push(`/brands/${brand.id}/first-reel`)}>
            Looks right – make my first Reel →
          </button>
        </div>
      )}
    </div>
  );
}
