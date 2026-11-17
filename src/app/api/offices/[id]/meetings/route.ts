import { db } from "@/db";
import { handle } from "@/lib/http";
import { makeDeps, registerMeeting } from "@/lib/meetings";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { url } = await req.json();
  return handle(async (userId) => registerMeeting(db, await makeDeps(db, id, userId), id, userId, String(url)));
}
