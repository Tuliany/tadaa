import { handle, requireUser } from "@/lib/auth";
import { updateUser } from "@/lib/db";

/** Email settings for the logged-in user. */
export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json({ weekly: user.emails?.weekly !== false });
});

export const PATCH = handle(async (req: Request) => {
  const user = await requireUser();
  const { weekly } = (await req.json().catch(() => ({}))) as { weekly?: boolean };
  const next = await updateUser(user.id, { emails: { ...(user.emails ?? {}), weekly: weekly !== false } });
  return Response.json({ weekly: next.emails?.weekly !== false });
});
