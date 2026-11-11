import { createHash, randomBytes } from "crypto";
import { handle } from "@/lib/auth";
import { getUserByEmail, saveReset } from "@/lib/db";
import { publicOrigin, sendEmail } from "@/lib/email";

const RESET_MINUTES = 60;

/** Always answers the same way, so it can't be used to find out who has an account. */
export const POST = handle(async (req: Request) => {
  const { email } = (await req.json()) as { email?: string };
  const user = email ? await getUserByEmail(email.trim()) : null;
  if (user) {
    const token = randomBytes(32).toString("base64url");
    await saveReset({
      tokenHash: createHash("sha256").update(token).digest("hex"),
      userId: user.id,
      expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000).toISOString(),
    });
    const link = `${publicOrigin(req)}/reset-password?token=${token}`;
    await sendEmail(
      user.email,
      "Reset your Tadaai password",
      `Hi ${user.name},\n\nSomeone asked to reset the password for your Tadaai account. Open this link within ${RESET_MINUTES} minutes to choose a new one:\n\n${link}\n\nIf it wasn't you, ignore this email – your password stays the same.`,
    );
  }
  return Response.json({ ok: true });
});
