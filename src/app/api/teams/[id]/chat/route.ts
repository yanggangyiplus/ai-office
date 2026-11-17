import { db } from "@/db";
import { sendChat } from "@/lib/chat";
import { handle } from "@/lib/http";
import { publishChat } from "@/lib/realtime/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { body } = await req.json().catch(() => ({ body: "" }));
  return handle((userId) => sendChat(db, publishChat, id, userId, String(body ?? "")));
}
