import { currentUser, handle } from "@/lib/auth";

export const GET = handle(async () => {
  const user = await currentUser();
  return Response.json(user ? { id: user.id, email: user.email, name: user.name } : null);
});
