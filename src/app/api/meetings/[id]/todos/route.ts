import { db } from "@/db";
import { handle } from "@/lib/http";
import { editTodos } from "@/lib/meetings";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { todos } = await req.json();
  return handle((userId) => editTodos(db, id, userId, todos));
}
