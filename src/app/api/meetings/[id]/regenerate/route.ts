import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { handle } from "@/lib/http";
import { makeDeps, makeNotesDeps, regenerate } from "@/lib/meetings";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async (userId) => {
    const [m] = await db.select({ officeId: meetings.officeId, notionPageId: meetings.notionPageId }).from(meetings).where(eq(meetings.id, id));
    if (!m) return new Response("not found", { status: 404 });
    // A meeting written in the site is summarized from its notes and needs no Notion token.
    const deps = m.notionPageId ? await makeDeps(db, m.officeId, userId) : makeNotesDeps();
    await regenerate(db, deps, id, userId);
  });
}
