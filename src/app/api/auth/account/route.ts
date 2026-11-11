import { promises as fs } from "fs";
import { cookies } from "next/headers";
import { handle, HttpError, requireUser, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { deleteUserCascade } from "@/lib/db";
import { renderPath, uploadPath } from "@/lib/storage";

/** Permanently delete the logged-in user's account, brands, uploads and Reels. Requires the password. */
export const DELETE = handle(async (req: Request) => {
  const user = await requireUser();
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(403, "That password isn't right.");
  }
  const { uploads, renders, brands } = await deleteUserCascade(user.id);
  await Promise.all([
    ...uploads.map((f) => fs.unlink(uploadPath(f)).catch(() => {})),
    ...renders.map((f) => fs.unlink(renderPath(f)).catch(() => {})),
  ]);
  (await cookies()).delete(SESSION_COOKIE);
  console.log(`[account] deleted user ${user.id} with ${brands} brands, ${uploads.length} uploads, ${renders.length} renders`);
  return Response.json({ ok: true });
});
