"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

const COMING_SOON = [
  {
    name: "Instagram",
    icon: "📸",
    what: "Learn from your profile and posts, publish approved Reels, and answer comments.",
    needs: "A Professional (Creator or Business) Instagram account.",
  },
  {
    name: "Facebook",
    icon: "📘",
    what: "Publish approved Reels to your Facebook Page.",
    needs: "A Facebook Page you manage.",
  },
  {
    name: "LinkedIn",
    icon: "💼",
    what: "Publish approved videos to your profile or company page.",
    needs: "Admin access to the company page.",
  },
  {
    name: "Google Drive",
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
        <span className="h-11 w-11 rounded-xl bg-cream grid place-items-center text-2xl">✳️</span>
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

export default function Accounts() {
  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight">Accounts</h1>
      <p className="mt-1 text-ink/60">Connect where your brand lives. Everything is optional – Tadaa makes Reels without any of these.</p>
      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <ClaudeCard />
        {COMING_SOON.map((c) => (
          <div key={c.name} className="card p-5 flex flex-col">
            <div className="flex items-center gap-3">
              <span className="h-11 w-11 rounded-xl bg-cream grid place-items-center text-2xl">{c.icon}</span>
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
