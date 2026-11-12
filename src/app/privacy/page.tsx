import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import { companyLine, LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy policy – Tadaai" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        This policy explains what personal data {LEGAL.product} collects, why, who we share it with, and the rights you have. It applies to
        the {LEGAL.product} website and app at {LEGAL.site} (the &quot;Service&quot;).
      </p>

      <h2>1. Who is responsible</h2>
      <p>
        The data controller is {companyLine()}. Questions or requests about your data: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> your name, email address and a securely hashed password (we never store the password itself).</li>
        <li>
          <strong>Brand data you give us:</strong> your website address, a description of your business, links to example Reels, and the brand
          profile we create from them (name, tone of voice, products, colours, logo).
        </li>
        <li><strong>Public website content:</strong> when you enter a website, we read its public pages (text, colours, logo and images) to build your brand profile.</li>
        <li><strong>Content you upload:</strong> photos and video clips, and the Reels, captions and hashtags created from them.</li>
        <li>
          <strong>Connected accounts</strong> (only if you choose to connect them): from Instagram, Facebook, LinkedIn or Google Drive we receive
          access tokens and the specific data needed for the feature you use – for example your profile name, the posts you publish through
          Tadaai, or the files you pick in Google Drive.
        </li>
        <li><strong>Technical data:</strong> a login cookie, and basic server logs (time, address requested, errors) kept to run and secure the Service.</li>
      </ul>
      <p>We do not sell your data, and we do not use it for advertising.</p>

      <h2>3. Why we use it, and on what legal basis</h2>
      <ul>
        <li><strong>To provide the Service</strong> – your account, brand profile, Reels and publishing (performance of our contract with you).</li>
        <li><strong>To keep it secure and working</strong> – logs, fraud and abuse prevention (our legitimate interest).</li>
        <li><strong>To contact you</strong> about your account, such as password resets and important changes (performance of contract).</li>
        <li><strong>To meet legal obligations</strong>, such as bookkeeping once paid plans exist.</li>
      </ul>

      <h2>4. AI processing</h2>
      <p>
        Tadaai uses AI to write brand profiles, ideas, scripts and captions. The text and brand information needed for that is sent to our AI
        provider, Anthropic. Under its commercial terms, Anthropic does not use this data to train its models. You decide what is published:
        nothing is posted without your approval.
      </p>

      <h2>5. Who we share data with</h2>
      <p>We use these service providers (&quot;processors&quot;), each only for the purpose listed:</p>
      <ul>
        <li><strong>Railway</strong> – hosting of the app, database and uploaded files.</li>
        <li><strong>Anthropic</strong> – AI text generation.</li>
        <li><strong>Resend</strong> – sending service emails such as password resets.</li>
        <li><strong>Cloudflare</strong> – domain name service and network security.</li>
        <li><strong>Meta, LinkedIn, TikTok and Google</strong> – only when you connect those accounts, to publish content or read files you choose.</li>
      </ul>
      <p>
        Some of these providers process data outside the EU/EEA, including in the United States. Where they do, transfers rely on the EU–US Data
        Privacy Framework or the European Commission&apos;s standard contractual clauses.
      </p>

      <h2>6. Google user data</h2>
      <p>
        If you connect Google Drive, Tadaai only accesses the files you select yourself. {LEGAL.product}&apos;s use and transfer of information
        received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. We use that data only to add your chosen media to your Tadaai library, we do not use it for
        advertising, we do not sell it, and no person reads it except where you ask us to for support, where it is needed for security, or
        where the law requires it.
      </p>

      <h3>Connected social accounts (TikTok)</h3>
      <p>
        If you connect a TikTok account, we receive and store your TikTok account id, display name and profile picture, and access tokens
        (stored encrypted). We use them only to show which account is connected and to publish the videos you choose to post, with the caption
        and privacy settings you select each time. We do not read your followers, messages or other videos. You can disconnect at any time under
        Accounts, which revokes our access at TikTok and deletes the stored tokens.
      </p>

      <h3>Connected social accounts (Facebook and Instagram)</h3>
      <p>
        If you connect with Facebook, we receive your Facebook user id and name, the list of Facebook Pages you choose to share with Tadaa
        (id, name, picture and a Page access token), and the Instagram professional account linked to each Page (id, username and profile
        picture). Tokens are stored encrypted. We use them only to show which Page and Instagram account are connected and to publish the Reels
        you choose to post, with the caption you write each time. We do not read your messages, followers, insights or other posts. You can
        disconnect at any time under Accounts, which removes Tadaa&apos;s permissions at Facebook and deletes the stored tokens. You can also
        remove Tadaa in your Facebook settings under Business Integrations; to ask us to delete any remaining data, email hello@tadaaai.com.
      </p>

      <h2>7. How long we keep data</h2>
      <ul>
        <li>Account, brand data, uploads and Reels: for as long as your account exists. When you delete your account, they are deleted within 30 days.</li>
        <li>Access tokens for connected accounts: until you disconnect the account or delete your Tadaai account.</li>
        <li>Server logs: up to 30 days. Password reset links expire after 60 minutes.</li>
      </ul>

      <h2>8. Cookies</h2>
      <p>
        We use one essential cookie to keep you logged in. We do not use advertising or tracking cookies, so no cookie consent banner is needed.
      </p>

      <h2>9. Your rights</h2>
      <p>
        Under the GDPR you can ask for a copy of your data, correct it, delete it, restrict or object to its use, and move it to another
        service. Most of it you can view and edit yourself in the app, and you can{" "}
        <Link href="/data-deletion">delete your account and data at any time</Link>. For anything else, email{" "}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>; we answer within 30 days. You can also complain to your data protection authority
        – in Sweden, Integritetsskyddsmyndigheten (IMY), <a href="https://www.imy.se" target="_blank" rel="noreferrer">imy.se</a>.
      </p>

      <h2>10. Security</h2>
      <p>
        Data is sent over encrypted connections (HTTPS), passwords are hashed, login sessions can be ended at any time, and access to your
        brands is limited to your account.
      </p>

      <h2>11. Children</h2>
      <p>The Service is for businesses and is not intended for anyone under 18.</p>

      <h2>12. Changes</h2>
      <p>If we change this policy in a way that matters, we will tell you by email or in the app before the change takes effect.</p>
    </LegalPage>
  );
}
