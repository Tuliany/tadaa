import { createHash } from "crypto";
import { handle, hashPassword, HttpError, startSession } from "@/lib/auth";
import { getReset, setPassword } from "@/lib/db";

export const POST = handle(async (req: Request) => {
  const { token, password } = (await req.json()) as { token?: string; password?: string };
  if (!password || password.length < 8) throw new HttpError(400, "Use a password of at least 8 characters.");
  const reset = token ? await getReset(createHash("sha256").update(token).digest("hex")) : null;
  if (!reset) throw new HttpError(400, "This reset link has expired or was already used. Ask for a new one.");
  await setPassword(reset.userId, await hashPassword(password));
  await startSession(reset.userId);
  return Response.json({ ok: true });
});
