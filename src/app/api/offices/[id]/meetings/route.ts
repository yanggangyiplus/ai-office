import { db } from "@/db";
import { handle } from "@/lib/http";
import { createNotesMeeting, makeDeps, meetingRequest, registerMeeting } from "@/lib/meetings";

// A Notion link imports minutes; a title starts a meeting written in the site.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  return handle(async (userId) => {
    const r = meetingRequest(body);
    if (r.kind === "notes") return createNotesMeeting(db, id, userId, r.title);
    return registerMeeting(db, await makeDeps(db, id, userId), id, userId, r.url);
  });
}
