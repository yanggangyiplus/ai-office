import { db } from "@/db";
import { handle } from "@/lib/http";
import { addItem, removeItem } from "@/lib/team-items";

type Ctx = { params: Promise<{ id: string }> };

// POST { kind: "rule" | "notice" | "link", title, url? }
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { kind?: unknown; title?: unknown; url?: unknown } | null;
  return handle(async (userId) => {
    await addItem(db, id, userId, { kind: body?.kind, title: body?.title, url: body?.url });
    return { ok: true };
  });
}

// DELETE { id }
export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  return handle(async (userId) => {
    await removeItem(db, id, userId, typeof body?.id === "string" ? body.id : "");
    return { ok: true };
  });
}
