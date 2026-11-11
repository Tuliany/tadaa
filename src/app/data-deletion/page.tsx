import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Delete your data – Tadaai" };

export default function DataDeletion() {
  return (
    <LegalPage title="Delete your data">
      <p>You can delete your {LEGAL.product} account and all data connected to it at any time.</p>

      <h2>Delete it yourself (immediate)</h2>
      <ol>
        <li>
          <Link href="/login?next=/account">Log in</Link> to {LEGAL.product}.
        </li>
        <li>
          Open <Link href="/account">Account</Link> (top menu).
        </li>
        <li>Click <strong>Delete my account</strong> and confirm with your password.</li>
      </ol>
      <p>
        This permanently deletes your account, brand profiles, uploaded photos and clips, generated Reels and any connections to Instagram,
        Facebook, LinkedIn or Google Drive. Remaining copies in backups are removed within 30 days.
      </p>

      <h2>Ask us to delete it</h2>
      <p>
        Can&apos;t log in? Email <a href={`mailto:${LEGAL.email}?subject=Delete%20my%20Tadaai%20data`}>{LEGAL.email}</a> from the address
        you signed up with, with the subject &quot;Delete my Tadaai data&quot;. We confirm and complete the deletion within 30 days.
      </p>

      <h2>Removing Tadaai from Facebook or Instagram</h2>
      <p>
        If you connected Facebook or Instagram, you can also remove {LEGAL.product}&apos;s access there: in Facebook go to{" "}
        <strong>Settings &amp; privacy → Settings → Business integrations</strong> (Instagram: <strong>Settings → Website permissions → Apps and
        websites</strong>), select {LEGAL.product} and remove it. You can then ask us to delete the data we received, as described above.
      </p>
    </LegalPage>
  );
}
