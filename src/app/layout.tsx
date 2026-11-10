import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tadaa – on-brand Reels for any business",
  description: "Upload a photo, get a finished on-brand Reel. Approve it and post.",
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
            <nav className="flex items-center gap-5 text-sm font-medium text-ink/70">
              <Link href="/brands" className="hover:text-ink">My brands</Link>
              <Link href="/onboarding" className="rounded-full bg-ink text-white px-4 py-1.5 hover:bg-ink/85">New brand</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
