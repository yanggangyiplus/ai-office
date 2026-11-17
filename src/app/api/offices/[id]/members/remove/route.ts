import { db } from "@/db";
import { handle } from "@/lib/http";
import { removeMember } from "@/lib/offices";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { userId: target } = await req.json();
  return handle((userId) => removeMember(db, id, userId, String(target)));
}
