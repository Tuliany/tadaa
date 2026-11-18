import { handle, hashPassword, HttpError, requireUser, startSession, verifyPassword } from "@/lib/auth";
import { setPassword } from "@/lib/db";

/** Change password while logged in. Needs the current password; logs out all other devices. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { current, password } = (await req.json().catch(() => ({}))) as { current?: string; password?: string };
  if (!current || !(await verifyPassword(current, user.passwordHash))) throw new HttpError(400, "Your current password isn't right.");
  if (!password || password.length < 8) throw new HttpError(400, "Use a new password of at least 8 characters.");
  if (password === current) throw new HttpError(400, "Choose a password you haven't used here.");
  await setPassword(user.id, await hashPassword(password));
  // setPassword ends every session; keep this device signed in.
  await startSession(user.id);
  return Response.json({ ok: true });
});
