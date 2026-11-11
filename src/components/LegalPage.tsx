import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-4xl font-black tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-ink/50">Last updated {LEGAL.updated}</p>
      <div className="legal mt-8 space-y-4 text-[15px] leading-relaxed text-ink/80">{children}</div>
      <nav className="mt-12 flex flex-wrap gap-5 border-t border-black/10 pt-6 text-sm font-semibold text-ink/60">
        <Link href="/privacy" className="hover:text-ink">Privacy policy</Link>
        <Link href="/terms" className="hover:text-ink">Terms of service</Link>
        <Link href="/data-deletion" className="hover:text-ink">Delete your data</Link>
      </nav>
    </article>
  );
}
