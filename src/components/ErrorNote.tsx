import Link from "next/link";

/** An error message; plan-limit errors get a "See plans" link. */
export default function ErrorNote({ error, className = "" }: { error: string; className?: string }) {
  if (!error) return null;
  const limit = /plan|free Reels|brands\./i.test(error);
  return (
    <p className={`rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3 ${className}`}>
      {error}
      {limit && (
        <>
          {" "}
          <Link href="/pricing" className="font-bold underline">
            See plans →
          </Link>
        </>
      )}
    </p>
  );
}
