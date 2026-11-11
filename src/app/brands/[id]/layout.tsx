"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Brand } from "@/lib/types";

const NAV = [
  { href: "", label: "Dashboard", icon: "▦" },
  { href: "/first-reel", label: "First reel", icon: "🚀" },
  { section: "Create" },
  { href: "/new", label: "Create reel", icon: "✨" },
  { href: "/creations", label: "Creations", icon: "🎬" },
  { href: "/edit", label: "Brand Brain", icon: "🧠" },
  { section: "Configure" },
  { href: "/accounts", label: "Accounts", icon: "🔗" },
] as const;

export default function BrandShell({ children }: LayoutProps<"/brands/[id]">) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const [brand, setBrand] = useState<Brand | null>(null);

  useEffect(() => {
    api<Brand>(`/api/brands/${id}`).then(setBrand).catch(() => {});
  }, [id, pathname]);

  const base = `/brands/${id}`;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
      <aside className="mb-6 lg:mb-0">
        <div className="card p-3 lg:sticky lg:top-20">
          <Link href="/brands" className="flex items-center gap-3 rounded-xl p-2 hover:bg-black/5">
            <span
              className="h-9 w-9 shrink-0 rounded-xl"
              style={{ background: brand ? `linear-gradient(135deg, ${brand.colors.primary}, ${brand.colors.secondary})` : "#eee" }}
            />
            <span className="min-w-0">
              <span className="block truncate font-bold">{brand?.name ?? "…"}</span>
              <span className="block text-xs text-ink/45">Switch brand</span>
            </span>
          </Link>
          <nav className="mt-2 flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {NAV.map((item, i) =>
              "section" in item ? (
                <p key={i} className="hidden lg:block px-3 pt-4 pb-1 text-xs font-semibold italic text-ink/40">{item.section}</p>
              ) : (
                <Link
                  key={item.href}
                  href={base + item.href}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap ${
                    pathname === base + item.href ? "bg-cream text-ink font-semibold" : "text-ink/65 hover:bg-black/5"
                  }`}
                >
                  <span className="w-5 text-center">{item.icon}</span>
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
