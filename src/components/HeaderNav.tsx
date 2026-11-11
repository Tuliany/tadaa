"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Me = { id: string; email: string; name: string } | null;

export default function HeaderNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | undefined>(undefined);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe(null));
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    router.push("/");
    router.refresh();
  }

  if (me === undefined) return <div className="h-8" />;
  if (!me) {
    return (
      <nav className="flex items-center gap-5 text-sm font-medium text-ink/70">
        <Link href="/login" className="hover:text-ink">Log in</Link>
        <Link href="/signup" className="rounded-full bg-ink text-white px-4 py-1.5 hover:bg-ink/85">Start free</Link>
      </nav>
    );
  }
  return (
    <nav className="flex items-center gap-5 text-sm font-medium text-ink/70">
      <Link href="/brands" className="hover:text-ink">My brands</Link>
      <Link href="/account" className="hidden sm:inline text-ink/40 hover:text-ink">{me.email}</Link>
      <button onClick={logout} className="hover:text-ink">Log out</button>
    </nav>
  );
}
