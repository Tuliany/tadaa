import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import { companyLine, LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of service – Tadaai" };

export default function Terms() {
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms apply between you and {companyLine()} (&quot;we&quot;) when you use {LEGAL.product} at {LEGAL.site} (the
        &quot;Service&quot;). By creating an account you accept them. The Service is intended for businesses and professionals.
      </p>

      <h2>1. The Service</h2>
      <p>
        {LEGAL.product} helps you create short social videos (&quot;Reels&quot;) and captions for your brand, using your content and AI, and –
        if you connect them – publish them to your social accounts after you approve them. We may improve, change or remove features over time.
      </p>

      <h2>2. Your account</h2>
      <p>
        You must give accurate information, keep your password safe and be at least 18. You are responsible for activity on your account and
        for the brands you add – you confirm you are allowed to represent them.
      </p>

      <h2>3. Your content</h2>
      <p>
        You keep all rights to the content you upload and to the Reels created for you. You give us the permission we need to store, process
        and display that content in order to provide the Service – and, when you approve it, to publish it to the accounts you connected. You
        confirm you have the rights to everything you upload, including people shown in it, music and logos.
      </p>

      <h2>4. AI-generated content</h2>
      <p>
        Scripts, captions and ideas are produced with AI and can contain mistakes. Review everything before you publish it: you are responsible
        for what you publish, including that claims, prices and offers are correct and that your posts follow the rules of each platform and
        applicable marketing law.
      </p>

      <h2>5. Acceptable use</h2>
      <p>Do not use the Service to:</p>
      <ul>
        <li>break the law, or infringe anyone&apos;s rights, including copyright and privacy;</li>
        <li>create misleading, hateful, harassing, sexual or violent content, or spam;</li>
        <li>impersonate others or create content for a brand you are not authorised to represent;</li>
        <li>try to break, overload, reverse-engineer or get around the security of the Service.</li>
      </ul>
      <p>We may suspend accounts that break these rules.</p>

      <h2>6. Connected accounts</h2>
      <p>
        When you connect Instagram, Facebook, LinkedIn, Google Drive or Claude, you also follow those services&apos; own terms. You can
        disconnect at any time. We are not responsible for changes or outages on those platforms.
      </p>

      <h2>7. Prices and payment</h2>
      <p>
        During the current early-access period the Service is free. Before any paid plan applies to you, we will show its price and terms, and
        nothing will be charged without your agreement.
      </p>

      <h2>8. Availability and liability</h2>
      <p>
        We work to keep the Service available and your data safe, but it is provided &quot;as is&quot;, without guarantees of uninterrupted
        operation. To the extent the law allows, we are not liable for indirect losses such as lost profit or lost data, and our total liability
        is limited to the amount you paid us in the 12 months before the claim. Nothing in these terms limits liability that cannot be limited
        by law.
      </p>

      <h2>9. Ending</h2>
      <p>
        You can stop using the Service and <Link href="/data-deletion">delete your account</Link> at any time. We may end the Service or your
        account with reasonable notice, or immediately if you seriously break these terms.
      </p>

      <h2>10. Privacy</h2>
      <p>
        How we handle personal data is described in our <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>11. Changes</h2>
      <p>We may update these terms. If a change matters, we will tell you before it applies; if you keep using the Service after that, the new terms apply.</p>

      <h2>12. Law and disputes</h2>
      <p>
        These terms are governed by the laws of {LEGAL.country}. Disputes are settled by the courts of {LEGAL.country}, unless mandatory law
        gives you another choice.
      </p>

      <h2>13. Contact</h2>
      <p>
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
      </p>
    </LegalPage>
  );
}
