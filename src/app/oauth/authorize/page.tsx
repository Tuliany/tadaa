import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { checkAuthorize, friendlyClientName } from "@/lib/authorize";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Authorize({ searchParams }: { searchParams: SP }) {
  const raw = await searchParams;
  const p = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const check = await checkAuthorize(p);
  if ("fatal" in check) {
    return (
      <main className="mx-auto max-w-md px-6 py-20">
        <div className="card p-8">
          <h1 className="text-2xl font-black">Can&apos;t connect</h1>
          <p className="mt-3 text-ink/70">{check.fatal}</p>
        </div>
      </main>
    );
  }
  if ("redirect" in check) redirect(check.redirect);

  const user = await currentUser();
  if (!user) {
    const here = `/oauth/authorize?${new URLSearchParams(p as Record<string, string>).toString()}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  const { client, redirectUri, state, codeChallenge, scope } = check.ok;
  const appName = friendlyClientName(client.name);
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="card p-8">
        <p className="text-sm font-semibold text-coral">Connect an app</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Allow {appName} to use your Tadaa account?</h1>
        <p className="mt-2 text-sm text-ink/60">Signed in as {user.email}</p>
        <p className="mt-5 font-semibold">{appName} will be able to:</p>
        <ul className="mt-2 space-y-1.5 text-sm text-ink/75 list-disc pl-5">
          <li>See your brands, Brand Brain, photos and Reels</li>
          <li>Create Reels, edit their text and approve them</li>
          <li>Export Reels as videos and get download links</li>
        </ul>
        <p className="mt-4 text-xs text-ink/50">
          It can&apos;t see your password or delete anything. You can disconnect at any time under Accounts.
        </p>
        <form method="post" action="/oauth/approve" className="mt-6 flex gap-3">
          <input type="hidden" name="client_id" value={client.clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="code_challenge" value={codeChallenge} />
          <input type="hidden" name="response_type" value="code" />
          <input type="hidden" name="scope" value={scope} />
          <button className="btn-primary" name="decision" value="allow">
            Allow
          </button>
          <button className="btn-ghost" name="decision" value="deny">
            Cancel
          </button>
        </form>
      </div>
    </main>
  );
}
