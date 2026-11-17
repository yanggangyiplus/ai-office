import { db } from "@/db";
import { handle } from "@/lib/http";
import { setRoles } from "@/lib/roles";

// Body: { roles: string[], userId?: string }. Without userId it sets your own; only the admin may set someone else's.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { roles?: unknown; userId?: unknown } | null;
  return handle(async (userId) => ({
    roles: await setRoles(db, id, userId, typeof body?.userId === "string" ? body.userId : userId, body?.roles),
  }));
}
