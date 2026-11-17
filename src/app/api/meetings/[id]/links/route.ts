import { db } from "@/db";
import { handle } from "@/lib/http";
import { addLink } from "@/lib/meetings";

// Body: { title?: string, url: string }. Only http(s) links are accepted.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { title?: string; url?: string } | null;
  return handle((userId) => addLink(db, id, userId, { title: body?.title ?? "", url: body?.url ?? "" }));
}
