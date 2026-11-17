import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { createIssuesForTodos, makeGithub } from "@/lib/github";
import { handle } from "@/lib/http";
import { ForbiddenError, isMember } from "@/lib/offices";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { todoIds } = await req.json();
  return handle(async (userId) => {
    const [m] = await db.select({ officeId: meetings.officeId }).from(meetings).where(eq(meetings.id, id));
    if (!m || !(await isMember(db, m.officeId, userId))) throw new ForbiddenError("members only");
    return createIssuesForTodos(db, await makeGithub(db, userId), id, todoIds, userId);
  });
}
