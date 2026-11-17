import { auth } from "@/auth";
import { db } from "@/db";
import { ForbiddenError, saveSettings } from "@/lib/offices";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await auth();
  if (!s) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  try {
    await saveSettings(db, id, s.user.id, await req.json());
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("forbidden", { status: 403 });
    throw e;
  }
  return Response.json({ ok: true });
}
