"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/client";

/** Official logo files in /public/logos – each brand's own asset, unmodified. Brands without one show their emoji. */
const LOGOS = new Set(["claude", "instagram", "facebook", "tiktok", "linkedin", "google-drive"]);

function Logo({ slug, emoji }: { slug: string; emoji: string }) {
  return (
    <span className="h-11 w-11 rounded-xl bg-cream grid place-items-center text-2xl overflow-hidden">
      {LOGOS.has(slug) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/logos/${slug}.png`} alt="" className="h-7 w-7 object-contain" />
      ) : (
        emoji
      )}
    </span>
  );
}

const COMING_SOON = [
  {
    name: "LinkedIn",
    slug: "linkedin",
    icon: "💼",
    what: "Publish approved videos to your profile or company page.",
    needs: "Admin access to the company page.",
  },
  {
    name: "Google Drive",
    slug: "google-drive",
    icon: "🗂️",
    what: "Pick a folder of photos and clips – they appear in your Tadaa library automatically.",
    needs: "A Google account with your brand's media.",
  },
];

interface Connections {
  connectorUrl: string;
  apps: { clientId: string; name: string; createdAt: string }[];
}

function ClaudeCard() {
  const [data, setData] = useState<Connections | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api<Connections>("/api/connections").then(setData).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const connected = !!data?.apps.length;
  const url = data?.connectorUrl ?? "";

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function disconnect() {
    if (!confirm("Disconnect Claude from your Tadaa account? Claude will need to sign in again to use Tadaa.")) return;
    setBusy(true);
    await api("/api/connections", { method: "DELETE" }).catch(() => {});
    await load();
    setBusy(false);
  }

  return (
    <div className="card p-5 flex flex-col md:col-span-2 border-2 border-coral/30">
      <div className="flex items-center gap-3">
        <Logo slug="claude" emoji="✳️" />
        <div>
          <p className="font-bold text-lg">Claude</p>
          <p className={`text-xs font-semibold ${connected ? "text-green-600" : "text-ink/40"}`}>{connected ? "Connected" : "Not connected"}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-ink/70">
        Plan, write and edit your Reels from inside your own Claude. Ask things like “make a Reel about our autumn offer with my latest photos” – Tadaa does
        the design and the video.
      </p>

      <div className="mt-4">
        <p className="label">Connector URL</p>
        <div className="mt-1 flex gap-2">
          <input className="input font-mono text-sm" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn-dark shrink-0" onClick={copy} disabled={!url}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <button className="mt-3 self-start text-sm font-semibold text-coral" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide steps" : "How to connect"} {open ? "▴" : "▾"}
      </button>
      {open && (
        <ol className="mt-2 space-y-1.5 text-sm text-ink/75 list-decimal pl-5">
          <li>
            In Claude, open <b>Settings → Connectors</b> (on Team and Enterprise plans an admin adds it under Organization settings).
          </li>
          <li>
            Click <b>Add custom connector</b>, name it <b>Tadaa</b> and paste the connector URL above.
          </li>
          <li>
            Click <b>Connect</b>, log in to Tadaa if asked, and press <b>Allow</b>.
          </li>
          <li>In a chat, turn on Tadaa in the tools menu and ask Claude to make a Reel.</li>
        </ol>
      )}

      {connected && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <span className="text-ink/60">
            Connected as {data!.apps.map((a) => a.name).join(", ")}
          </span>
          <button className="btn-ghost" onClick={disconnect} disabled={busy}>
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      )}
    </div>
  );
}

interface TikTokState {
  available: boolean;
  connected: boolean;
  displayName?: string;
  avatarUrl?: string;
  canPost: boolean;
}

function TikTokCard() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const [tt, setTt] = useState<TikTokState | null>(null);
  const [busy, setBusy] = useState(false);
  const result = params.get("tiktok");
  const message = params.get("message");

  const load = () =>
    api<{ tiktok: TikTokState }>(`/api/brands/${id}/connections`)
      .then((r) => setTt(r.tiktok))
      .catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function disconnect() {
    if (!confirm("Disconnect TikTok? Tadaa will no longer be able to post to this account.")) return;
    setBusy(true);
    await api(`/api/brands/${id}/connections?provider=tiktok`, { method: "DELETE" }).catch(() => {});
    await load();
    setBusy(false);
  }

  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-center gap-3">
        <Logo slug="tiktok" emoji="🎵" />
        <div className="min-w-0">
          <p className="font-bold text-lg">TikTok</p>
          <p className={`text-xs font-semibold truncate ${tt?.connected ? "text-green-600" : "text-ink/40"}`}>
            {tt?.connected ? `Connected · ${tt.displayName}` : "Not connected"}
          </p>
        </div>
        {tt?.connected && tt.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tt.avatarUrl} alt="" className="ml-auto h-9 w-9 rounded-full" />
        )}
      </div>
      <p className="mt-3 text-sm text-ink/70">Post approved Reels straight to TikTok, with your caption and privacy settings.</p>
      <p className="mt-1 text-xs text-ink/45">Needs: a TikTok account (Business or Creator recommended).</p>
      {result === "connected" && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">TikTok connected ✓</p>}
      {result === "partial" && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</p>}
      {result === "error" && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Couldn&apos;t connect TikTok: {message}</p>}
      {tt && !tt.available ? (
        <button className="btn-ghost mt-4 self-start" disabled title="Coming soon">
          Connect · coming soon
        </button>
      ) : tt?.connected ? (
        <div className="mt-4 flex gap-2">
          {!tt.canPost && (
            <a className="btn-dark" href={`/api/connect/tiktok/start?brandId=${id}`}>
              Reconnect
            </a>
          )}
          <button className="btn-ghost" onClick={disconnect} disabled={busy}>
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      ) : (
        <a className="btn-dark mt-4 self-start" href={`/api/connect/tiktok/start?brandId=${id}`}>
          Connect TikTok
        </a>
      )}
    </div>
  );
}

interface MetaState {
  available: boolean;
  connected: boolean;
  displayName?: string;
  expired: boolean;
  pages: { id: string; name: string; pictureUrl?: string; igUsername?: string }[];
  selectedPageId?: string;
  page: { id: string; name: string; pictureUrl?: string } | null;
  instagram: { username?: string; pictureUrl?: string } | null;
}

function MetaCard() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const [m, setM] = useState<MetaState | null>(null);
  const [busy, setBusy] = useState(false);
  const result = params.get("meta");
  const message = params.get("message");

  const load = () =>
    api<{ meta: MetaState }>(`/api/brands/${id}/connections`)
      .then((r) => setM(r.meta))
      .catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function disconnect() {
    if (!confirm("Disconnect Instagram & Facebook? Tadaa will no longer be able to post to them.")) return;
    setBusy(true);
    await api(`/api/brands/${id}/connections?provider=meta`, { method: "DELETE" }).catch(() => {});
    await load();
    setBusy(false);
  }

  async function choosePage(pageId: string) {
    setBusy(true);
    await api(`/api/brands/${id}/connections`, { method: "PATCH", json: { provider: "meta", pageId } }).catch(() => {});
    await load();
    setBusy(false);
  }

  const connectUrl = `/api/connect/meta/start?brandId=${id}`;

  return (
    <div className="card p-5 flex flex-col md:col-span-2">
      <div className="flex items-center gap-3">
        <Logo slug="instagram" emoji="📸" />
        <Logo slug="facebook" emoji="📘" />
        <div className="min-w-0">
          <p className="font-bold text-lg">Instagram &amp; Facebook</p>
          <p className={`text-xs font-semibold truncate ${m?.connected && !m.expired ? "text-green-600" : "text-ink/40"}`}>
            {m?.connected
              ? m.expired
                ? "Connection expired – reconnect"
                : `Connected · ${m.page?.name ?? m.displayName}${m.instagram ? ` · @${m.instagram.username}` : ""}`
              : "Not connected"}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-ink/70">
        Post approved Reels to your Facebook Page and the Instagram professional account linked to it – one login for both.
      </p>
      <p className="mt-1 text-xs text-ink/45">
        Needs: a Facebook Page you manage. For Instagram, a Business or Creator account linked to that Page.
      </p>
      {result === "connected" && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Instagram &amp; Facebook connected ✓</p>}
      {result === "nopages" && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</p>}
      {result === "error" && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Couldn&apos;t connect: {message}</p>}

      {m?.connected && m.pages.length > 0 && (
        <div className="mt-4 space-y-2">
          <span className="label">Post as</span>
          {m.pages.map((p) => (
            <label key={p.id} className="flex items-center gap-3 rounded-xl border border-ink/10 px-3 py-2 text-sm">
              <input type="radio" className="accent-coral" name="metaPage" checked={m.selectedPageId === p.id} disabled={busy} onChange={() => choosePage(p.id)} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.pictureUrl && <img src={p.pictureUrl} alt="" className="h-7 w-7 rounded-full" />}
              <span>
                <span className="font-semibold">{p.name}</span>
                <span className="block text-xs text-ink/55">
                  {p.igUsername ? `Facebook Page + Instagram @${p.igUsername}` : "Facebook Page only – no Instagram linked"}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      {m && !m.available ? (
        <button className="btn-ghost mt-4 self-start" disabled title="Coming soon">
          Connect · coming soon
        </button>
      ) : m?.connected ? (
        <div className="mt-4 flex gap-2">
          <a className={m.expired ? "btn-dark" : "btn-ghost"} href={connectUrl}>
            Reconnect
          </a>
          <button className="btn-ghost" onClick={disconnect} disabled={busy}>
            {busy ? "…" : "Disconnect"}
          </button>
        </div>
      ) : (
        <a className="btn-dark mt-4 self-start" href={connectUrl}>
          Continue with Facebook
        </a>
      )}
    </div>
  );
}

export default function Accounts() {
  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight">Accounts</h1>
      <p className="mt-1 text-ink/60">Connect where your brand lives. Everything is optional – Tadaa makes Reels without any of these.</p>
      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <ClaudeCard />
        <Suspense>
          <MetaCard />
        </Suspense>
        <Suspense>
          <TikTokCard />
        </Suspense>
        {COMING_SOON.map((c) => (
          <div key={c.name} className="card p-5 flex flex-col">
            <div className="flex items-center gap-3">
              <Logo slug={c.slug} emoji={c.icon} />
              <div>
                <p className="font-bold text-lg">{c.name}</p>
                <p className="text-xs font-semibold text-ink/40">Not connected</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-ink/70">{c.what}</p>
            <p className="mt-1 text-xs text-ink/45">Needs: {c.needs}</p>
            <button className="btn-ghost mt-4 self-start" disabled title="Coming soon">
              Connect · coming soon
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
