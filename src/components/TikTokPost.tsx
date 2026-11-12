"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Reel } from "@/lib/types";

interface Creator {
  creator_avatar_url: string;
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

interface Connections {
  tiktok: { available: boolean; connected: boolean; displayName?: string; avatarUrl?: string; canPost: boolean };
}

const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

const MUSIC_URL = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
const BC_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";

/**
 * "Post to TikTok" – follows TikTok's Direct Post UX rules: fresh creator info, the creator shown,
 * privacy chosen by the user (no default), interactions off unless ticked, commercial content disclosure,
 * and the consent line right above the button.
 */
export default function TikTokPost({ reel, onChange }: { reel: Reel; onChange: (r: Reel) => void }) {
  const [conn, setConn] = useState<Connections["tiktok"] | null>(null);
  const [open, setOpen] = useState(false);
  const [creator, setCreator] = useState<Creator | null>(null);
  const [tooLong, setTooLong] = useState(false);
  const [title, setTitle] = useState("");
  const [privacy, setPrivacy] = useState("");
  const [comment, setComment] = useState(false);
  const [duet, setDuet] = useState(false);
  const [stitch, setStitch] = useState(false);
  const [disclose, setDisclose] = useState(false);
  const [yourBrand, setYourBrand] = useState(false);
  const [branded, setBranded] = useState(false);
  const [busy, setBusy] = useState<"" | "loading" | "posting">("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Connections>(`/api/brands/${reel.brandId}/connections`)
      .then((c) => setConn(c.tiktok))
      .catch(() => setConn(null));
  }, [reel.brandId]);

  const pubs = (reel.publications ?? []).filter((p) => p.provider === "tiktok");
  const processing = pubs.some((p) => p.status === "processing");

  // Poll TikTok while a post is processing.
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(async () => {
      try {
        onChange(await api<Reel>(`/api/reels/${reel.id}/publications`));
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [processing, reel.id, onChange]);

  async function openPanel() {
    setOpen(true);
    setError("");
    setBusy("loading");
    setTitle(`${reel.script.caption}\n\n${reel.script.hashtags.join(" ")}`.trim().slice(0, 2200));
    setPrivacy("");
    setComment(false);
    setDuet(false);
    setStitch(false);
    setDisclose(false);
    setYourBrand(false);
    setBranded(false);
    try {
      const r = await api<{ creator: Creator; tooLong: boolean }>(`/api/reels/${reel.id}/tiktok`);
      setCreator(r.creator);
      setTooLong(r.tooLong);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function post() {
    setBusy("posting");
    setError("");
    try {
      const r = await api<Reel>(`/api/reels/${reel.id}/tiktok`, {
        method: "POST",
        json: {
          title,
          privacyLevel: privacy,
          allowComment: comment,
          allowDuet: duet,
          allowStitch: stitch,
          disclose,
          yourBrand,
          brandedContent: branded,
          consent: true,
        },
      });
      onChange(r);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (!conn || !conn.available) return null;

  if (!conn.connected) {
    return (
      <Link href={`/brands/${reel.brandId}/accounts`} className="btn-ghost text-center">
        Connect TikTok to post from here
      </Link>
    );
  }

  const disclosureIncomplete = disclose && !yourBrand && !branded;
  const brandedPrivate = branded && privacy === "SELF_ONLY";
  const canPost = !!creator && !!privacy && !disclosureIncomplete && !brandedPrivate && !tooLong && !busy && title.length <= 2200;
  const consent = branded
    ? { text: "Branded Content Policy and Music Usage Confirmation", links: true }
    : { text: "Music Usage Confirmation", links: false };

  return (
    <div className="grid gap-2">
      {!open && (
        <button className="btn-dark py-3" onClick={openPanel} disabled={!conn.canPost || processing}>
          {processing ? "Posting to TikTok…" : "Post to TikTok"}
        </button>
      )}
      {!conn.canPost && <p className="text-xs text-ink/55">Reconnect TikTok under Accounts and allow posting.</p>}

      {pubs.length > 0 && !open && (
        <ul className="space-y-1 text-xs">
          {pubs
            .slice()
            .reverse()
            .map((p) => (
              <li key={p.publishId} className={p.status === "failed" ? "text-red-700" : "text-ink/60"}>
                TikTok · {p.accountName} · {PRIVACY_LABELS[p.privacy] ?? p.privacy} ·{" "}
                {p.status === "processing"
                  ? "Processing – it can take a few minutes to appear on your profile"
                  : p.status === "published"
                    ? "Posted ✓"
                    : `Failed: ${p.error}`}
              </li>
            ))}
        </ul>
      )}

      {open && (
        <div className="card p-4 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-bold">Post to TikTok</p>
            <button className="text-ink/50" onClick={() => setOpen(false)} disabled={busy === "posting"}>
              Cancel
            </button>
          </div>

          {busy === "loading" && <p className="mt-3 text-ink/50">Checking your TikTok account…</p>}

          {creator && (
            <div className="mt-3 space-y-4">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {creator.creator_avatar_url && <img src={creator.creator_avatar_url} alt="" className="h-8 w-8 rounded-full" />}
                <div>
                  <p className="font-semibold leading-tight">{creator.creator_nickname}</p>
                  {creator.creator_username && <p className="text-xs text-ink/50">@{creator.creator_username}</p>}
                </div>
              </div>

              {tooLong && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
                  This video is longer than this account can post ({creator.max_video_post_duration_sec}s max).
                </p>
              )}

              <label className="block">
                <span className="label">Title</span>
                <textarea className="input mt-1 min-h-24" value={title} maxLength={2200} onChange={(e) => setTitle(e.target.value)} />
              </label>

              <label className="block">
                <span className="label">Who can view this video</span>
                <select className="input mt-1" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
                  <option value="" disabled>
                    Select…
                  </option>
                  {creator.privacy_level_options.map((o) => (
                    <option
                      key={o}
                      value={o}
                      disabled={o === "SELF_ONLY" && branded}
                      title={o === "SELF_ONLY" && branded ? "Branded content visibility cannot be set to private." : undefined}
                    >
                      {PRIVACY_LABELS[o] ?? o}
                      {o === "SELF_ONLY" && branded ? " – not available for branded content" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <span className="label">Allow users to</span>
                <div className="mt-1 flex flex-wrap gap-4">
                  <Check label="Comment" checked={comment} onChange={setComment} disabled={creator.comment_disabled} />
                  <Check label="Duet" checked={duet} onChange={setDuet} disabled={creator.duet_disabled} />
                  <Check label="Stitch" checked={stitch} onChange={setStitch} disabled={creator.stitch_disabled} />
                </div>
                {(creator.comment_disabled || creator.duet_disabled || creator.stitch_disabled) && (
                  <p className="mt-1 text-xs text-ink/45">Greyed-out options are turned off in this account&apos;s TikTok settings.</p>
                )}
              </div>

              <div className="rounded-xl bg-cream px-3 py-3">
                <label className="flex items-center justify-between gap-3">
                  <span>
                    <span className="font-semibold">Disclose video content</span>
                    <span className="block text-xs text-ink/55">Turn on if this video promotes yourself, a third party, or both.</span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-coral"
                    checked={disclose}
                    onChange={(e) => {
                      setDisclose(e.target.checked);
                      if (!e.target.checked) {
                        setYourBrand(false);
                        setBranded(false);
                      }
                    }}
                  />
                </label>
                {disclose && (
                  <div className="mt-3 space-y-2">
                    <Check
                      label="Your brand"
                      hint="You are promoting yourself or your own business. The video will be labelled “Promotional content”."
                      checked={yourBrand}
                      onChange={setYourBrand}
                    />
                    <Check
                      label="Branded content"
                      hint="You are promoting another brand or a third party. The video will be labelled “Paid partnership”."
                      checked={branded}
                      onChange={(v) => {
                        setBranded(v);
                        if (v && privacy === "SELF_ONLY") setPrivacy("");
                      }}
                    />
                    {disclosureIncomplete && (
                      <p className="text-xs text-red-700">You need to indicate if your content promotes yourself, a third party, or both.</p>
                    )}
                  </div>
                )}
              </div>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}

              <p className="text-xs text-ink/60">
                By posting, you agree to TikTok&apos;s{" "}
                {consent.links ? (
                  <>
                    <a className="underline" href={BC_URL} target="_blank" rel="noreferrer">
                      Branded Content Policy
                    </a>{" "}
                    and{" "}
                  </>
                ) : null}
                <a className="underline" href={MUSIC_URL} target="_blank" rel="noreferrer">
                  Music Usage Confirmation
                </a>
                .
              </p>

              <button className="btn-primary w-full py-3" onClick={post} disabled={!canPost}>
                {busy === "posting" ? "Uploading to TikTok… (up to a couple of minutes)" : "Post"}
              </button>
              <p className="text-xs text-ink/45">After posting, it can take a few minutes for the video to appear on your TikTok profile.</p>
            </div>
          )}
          {!creator && error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}

function Check({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2 ${disabled ? "opacity-40" : ""}`}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-coral" checked={checked && !disabled} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-ink/55">{hint}</span>}
      </span>
    </label>
  );
}
