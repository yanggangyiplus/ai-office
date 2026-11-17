import { db } from "@/db";
import { handle } from "@/lib/http";
import { createInvite, requireAdmin } from "@/lib/offices";

// Admin only: makes a new invite code for the team and returns it.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async (userId) => {
    await requireAdmin(db, id, userId);
    return { code: await createInvite(db, id) };
  });
}
