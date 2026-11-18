import { db } from "@/db";
import { handle } from "@/lib/http";
import { setToday } from "@/lib/team-items";

// POST { today: string } sets your own one-line "today".
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { today?: unknown } | null;
  return handle(async (userId) => {
    await setToday(db, id, userId, body?.today);
    return { ok: true };
  });
}
