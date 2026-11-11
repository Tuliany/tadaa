import { handle, HttpError, startSession, verifyPassword } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db";

export const POST = handle(async (req: Request) => {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  const user = email ? await getUserByEmail(email.trim()) : null;
  if (!user || !password || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, "Wrong email or password.");
  }
  await startSession(user.id);
  return Response.json({ id: user.id, email: user.email, name: user.name });
});
