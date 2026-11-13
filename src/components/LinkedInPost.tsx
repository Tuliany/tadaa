"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Reel } from "@/lib/types";

interface LiConn {
  available: boolean;
  connected: boolean;
  displayName?: string;
  avatarUrl?: string;
  expired: boolean;
}

/** "Post to LinkedIn" – publishes the approved Reel to the connected member's profile. */
export default function LinkedInPost({ reel, onChange }: { reel: Reel; onChange: (r: Reel) => void }) {
  const [conn, setConn] = useState<LiConn | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ linkedin: LiConn }>(`/api/brands/${reel.brandId}/connections`)
      .then((c) => setConn(c.linkedin))
      .catch(() => setConn(null));
  }, [reel.brandId]);

  const pubs = (reel.publications ?? []).filter((p) => p.provider === "linkedin");
  const processing = pubs.some((p) => p.status === "processing");

  useEffect(() => {
    if (!processing) return;
    const t = setInterval(async () => {
      try {
        onChange(await api<Reel>(`/api/reels/${reel.id}/publications`));
      } catch {}
    }, 6000);
    return () => clearInterval(t);
  }, [processing, reel.id, onChange]);

  if (!conn || !conn.available) return null;
  if (!conn.connected || conn.expired) {
    return (
      <Link href={`/brands/${reel.brandId}/accounts`} className="btn-ghost text-center">
        {conn.expired ? "Reconnect LinkedIn to post from here" : "Connect LinkedIn to post from here"}
      </Link>
    );
  }

  function openPanel() {
    setText(`${reel.script.caption}\n\n${reel.script.hashtags.join(" ")}`.trim().slice(0, 3000));
    setError("");
    setOpen(true);
  }

  async function post() {
    setBusy(true);
    setError("");
    try {
      onChange(await api<Reel>(`/api/reels/${reel.id}/linkedin`, { method: "POST", json: { text } }));
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      {!open && (
        <button className="btn-dark py-3" onClick={openPanel} disabled={processing}>
          {processing ? "Posting to LinkedIn…" : "Post to LinkedIn"}
        </button>
      )}
      {pubs.length > 0 && !open && (
        <ul className="space-y-1 text-xs">
          {pubs
            .slice()
            .reverse()
            .map((p) => (
              <li key={p.publishId} className={p.status === "failed" ? "text-red-700" : "text-ink/60"}>
                LinkedIn · {p.accountName} ·{" "}
                {p.status === "processing" ? (
                  "Processing – LinkedIn takes a few minutes to prepare videos"
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
            <p className="font-bold">Post to LinkedIn</p>
            <button className="text-ink/50" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
          <div className="mt-3 space-y-4">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={conn.avatarUrl || "/logos/linkedin.png"} alt="" className="h-8 w-8 rounded-full" />
              <div>
                <p className="font-semibold leading-tight">{conn.displayName}</p>
                <p className="text-xs text-ink/50">Your LinkedIn profile · Anyone</p>
              </div>
            </div>
            <label className="block">
              <span className="label">Post text</span>
              <textarea className="input mt-1 min-h-28" value={text} maxLength={3000} onChange={(e) => setText(e.target.value)} />
              <span className="mt-1 block text-xs text-ink/45">{text.length}/3000</span>
            </label>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
            <button className="btn-primary w-full py-3" onClick={post} disabled={busy || !text.trim()}>
              {busy ? "Uploading to LinkedIn… (up to a couple of minutes)" : "Post now"}
            </button>
            <p className="text-xs text-ink/45">Posts publicly to your profile. LinkedIn takes a few minutes to process the video.</p>
          </div>
        </div>
      )}
    </div>
  );
}
