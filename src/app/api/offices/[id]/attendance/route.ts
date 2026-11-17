import { db } from "@/db";
import { applyAttendance } from "@/lib/attendance";
import { handle } from "@/lib/http";

// Body: { action: "in" | "out" | "status", status? }. Always about the signed-in person only.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  return handle((userId) => applyAttendance(db, id, userId, body));
}
