import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { handle } from "@/lib/http";
import { makeDeps, regenerate } from "@/lib/meetings";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async (userId) => {
    const [m] = await db.select({ officeId: meetings.officeId }).from(meetings).where(eq(meetings.id, id));
    if (!m) return new Response("not found", { status: 404 });
    await regenerate(db, await makeDeps(db, m.officeId, userId), id, userId);
  });
}
