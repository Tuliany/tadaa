import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import HeaderNav from "@/components/HeaderNav";

export const metadata: Metadata = {
  title: "Tadaa – on-brand Reels for any business",
  description: "Upload a photo, get a finished on-brand Reel. Approve it and post.",
  // Meta Business domain verification for tadaaai.com.
  other: { "facebook-domain-verification": "y5yo040fp2z6j66b991iefy8669t8b" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-black/5 bg-white/80 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
            <Link href="/" className="font-black text-xl tracking-tight">
              tadaa<span className="text-coral">!</span>
            </Link>
            <HeaderNav />
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-black/5 bg-white/60">
          <div className="mx-auto max-w-6xl px-4 py-6 flex flex-wrap items-center justify-between gap-3 text-sm text-ink/50">
            <span>© 2026 Tadaai</span>
            <nav className="flex gap-5">
              <Link href="/privacy" className="hover:text-ink">Privacy</Link>
              <Link href="/terms" className="hover:text-ink">Terms</Link>
              <Link href="/data-deletion" className="hover:text-ink">Delete your data</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
