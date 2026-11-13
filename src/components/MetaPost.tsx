"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Reel } from "@/lib/types";

interface IgConn {
  available: boolean;
  connected: boolean;
  account: { id: string; username?: string; pictureUrl?: string } | null;
}

interface MetaConn {
  available: boolean;
  connected: boolean;
  expired: boolean;
  page: { id: string; name: string; pictureUrl?: string } | null;
  instagram: { username?: string; pictureUrl?: string } | null;
}

/** "Post to Instagram / Facebook" – publishes the approved Reel to the brand's chosen Page and its Instagram. */
export default function MetaPost({ reel, onChange }: { reel: Reel; onChange: (r: Reel) => void }) {
  const [conn, setConn] = useState<MetaConn | null>(null);
  const [igConn, setIgConn] = useState<IgConn | null>(null);
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [ig, setIg] = useState(true);
  const [fb, setFb] = useState(true);
  const [shareToFeed, setShareToFeed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ meta: MetaConn; instagram: IgConn }>(`/api/brands/${reel.brandId}/connections`)
      .then((c) => {
        setConn(c.meta);
        setIgConn(c.instagram);
      })
      .catch(() => setConn(null));
  }, [reel.brandId]);

  const pubs = (reel.publications ?? []).filter((p) => p.provider === "instagram" || p.provider === "facebook");
  const processing = pubs.some((p) => p.status === "processing");

  useEffect(() => {
    if (!processing) return;
    const t = setInterval(async () => {
      try {
        onChange(await api<Reel>(`/api/reels/${reel.id}/publications`));
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [processing, reel.id, onChange]);

  if (!conn || !(conn.available || igConn?.available)) return null;

  const fbOk = conn.connected && !!conn.page && !conn.expired;
  // Instagram: the directly connected account wins; otherwise the one linked to the Facebook Page.
  const igName = igConn?.account?.username ?? (fbOk ? conn.instagram?.username : undefined);
  const hasIg = !!igName;

  if (!fbOk && !hasIg) {
    return (
      <Link href={`/brands/${reel.brandId}/accounts`} className="btn-ghost text-center">
        {conn.expired ? "Reconnect Facebook to post from here" : "Connect Instagram or Facebook to post from here"}
      </Link>
    );
  }

  const hashtags = (caption.match(/#/g) ?? []).length;
  const wantIg = hasIg && ig;
  const wantFb = fbOk && fb;
  const canPost = !busy && (wantIg || wantFb) && caption.length <= 2200 && hashtags <= 30;

  function openPanel() {
    setCaption(`${reel.script.caption}\n\n${reel.script.hashtags.join(" ")}`.trim().slice(0, 2200));
    setIg(hasIg);
    setFb(fbOk);
    setShareToFeed(true);
    setError("");
    setOpen(true);
  }

  async function post() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ reel: Reel; errors: string[] }>(`/api/reels/${reel.id}/meta`, {
        method: "POST",
        json: { caption, instagram: wantIg, facebook: wantFb, shareToFeed },
      });
      onChange(r.reel);
      if (r.errors.length) setError(r.errors.join(" "));
      else setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label = hasIg && fbOk ? "Post to Instagram & Facebook" : hasIg ? "Post to Instagram" : "Post to Facebook";

  return (
    <div className="grid gap-2">
      {!open && (
        <button className="btn-dark py-3" onClick={openPanel} disabled={processing}>
          {processing ? "Posting…" : label}
        </button>
      )}

      {pubs.length > 0 && !open && (
        <ul className="space-y-1 text-xs">
          {pubs
            .slice()
            .reverse()
            .map((p) => (
              <li key={p.provider + p.publishId} className={p.status === "failed" ? "text-red-700" : "text-ink/60"}>
                {p.provider === "instagram" ? "Instagram" : "Facebook"} · {p.accountName} ·{" "}
                {p.status === "processing" ? (
                  "Processing – usually takes a minute or two"
                ) : p.status === "published" ? (
                  p.permalink ? (
                    <a className="underline" href={p.permalink} target="_blank" rel="noreferrer">
                      Posted ✓ View
                    </a>
                  ) : (
                    "Posted ✓"
                  )
                ) : (
                  `Failed: ${p.error}`
                )}
              </li>
            ))}
        </ul>
      )}

      {open && (
        <div className="card p-4 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-bold">{label}</p>
            <button className="text-ink/50" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
          <div className="mt-3 space-y-4">
            <div className="space-y-2">
              <span className="label">Post to</span>
              <Target
                checked={wantIg}
                disabled={!hasIg}
                onChange={setIg}
                logo="/logos/instagram.png"
                title={hasIg ? `@${igName}` : "Instagram"}
                hint={hasIg ? "Instagram Reel" : "Not connected – connect Instagram under Accounts."}
              />
              <Target
                checked={wantFb}
                disabled={!fbOk}
                onChange={setFb}
                logo="/logos/facebook.png"
                title={fbOk ? conn.page!.name : "Facebook Page"}
                hint={fbOk ? "Facebook Page Reel" : "Not connected – connect Facebook under Accounts."}
              />
            </div>

            <label className="block">
              <span className="label">Caption</span>
              <textarea className="input mt-1 min-h-28" value={caption} maxLength={2200} onChange={(e) => setCaption(e.target.value)} />
              <span className={`mt-1 block text-xs ${hashtags > 30 ? "text-red-700" : "text-ink/45"}`}>
                {caption.length}/2200 · {hashtags}/30 hashtags
              </span>
            </label>

            {wantIg && (
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-coral" checked={shareToFeed} onChange={(e) => setShareToFeed(e.target.checked)} />
                <span>
                  Also show in the Instagram feed
                  <span className="block text-xs text-ink/55">Off means it only appears in the Reels tab.</span>
                </span>
              </label>
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}

            <button className="btn-primary w-full py-3" onClick={post} disabled={!canPost}>
              {busy ? "Uploading… (up to a couple of minutes)" : "Post now"}
            </button>
            <p className="text-xs text-ink/45">Posts publicly right away. Reels can take a minute or two to process before they appear.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Target(props: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; logo: string; title: string; hint: string }) {
  return (
    <label className={`flex items-center gap-3 rounded-xl border border-ink/10 px-3 py-2 ${props.disabled ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        className="h-4 w-4 accent-coral"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={props.logo} alt="" className="h-6 w-6" />
      <span>
        <span className="font-semibold">{props.title}</span>
        <span className="block text-xs text-ink/55">{props.hint}</span>
      </span>
    </label>
  );
}
