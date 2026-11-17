import { db } from "@/db";
import { handle } from "@/lib/http";
import { confirmMeeting } from "@/lib/meetings";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle((userId) => confirmMeeting(db, id, userId));
}
