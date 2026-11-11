import { nanoid } from "nanoid";
import { handle, hashPassword, HttpError, startSession } from "@/lib/auth";
import { createUser } from "@/lib/db";

export const POST = handle(async (req: Request) => {
  const { email, password, name } = (await req.json()) as { email?: string; password?: string; name?: string };
  const cleanEmail = email?.trim().toLowerCase() ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) throw new HttpError(400, "Enter a valid email address.");
  if (!password || password.length < 8) throw new HttpError(400, "Use a password of at least 8 characters.");

  try {
    const user = await createUser({
      id: nanoid(12),
      email: cleanEmail,
      name: name?.trim() || cleanEmail.split("@")[0],
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
    });
    await startSession(user.id);
    return Response.json({ id: user.id, email: user.email, name: user.name });
  } catch (e) {
    if ((e as Error).message === "EMAIL_TAKEN") throw new HttpError(409, "There's already an account with that email – log in instead.");
    throw e;
  }
});
