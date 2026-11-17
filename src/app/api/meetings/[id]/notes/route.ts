import { db } from "@/db";
import { handle } from "@/lib/http";
import { saveNotes } from "@/lib/meetings";

// Body: { notes: string }. Members only, and only until the meeting is confirmed.
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { notes?: unknown } | null;
  return handle((userId) => saveNotes(db, id, userId, body?.notes as string));
}
