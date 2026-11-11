"use client";

const CONNECTIONS = [
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
  {
    name: "Claude",
    icon: "✳️",
    what: "Plan, write and edit your Reels from inside your own Claude, with Tadaa doing the rendering.",
    needs: "A Claude account.",
  },
];

export default function Accounts() {
  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight">Accounts</h1>
      <p className="mt-1 text-ink/60">Connect where your brand lives. Everything is optional – Tadaa makes Reels without any of these.</p>
      <div className="mt-8 grid md:grid-cols-2 gap-4">
        {CONNECTIONS.map((c) => (
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
