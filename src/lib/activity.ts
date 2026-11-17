import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { activity, users } from "@/db/schema";
import { ForbiddenError, isMember } from "./offices";

export const FEED_LIMIT = 30;
export type ActivityItem = { id: string; userId: string; name: string; text: string; at: number };

// Writes one feed sentence. Never throws: losing a feed line must not undo the real action it describes.
export async function logActivity(db: Db, officeId: string, userId: string, text: string): Promise<void> {
  try {
    await db.insert(activity).values({ officeId, userId, text });
  } catch {
    // intentionally ignored
  }
}

export async function recentActivity(db: Db, officeId: string, userId: string, limit = FEED_LIMIT): Promise<ActivityItem[]> {
  if (!(await isMember(db, officeId, userId))) throw new ForbiddenError("members only");
  const rows = await db
    .select({ id: activity.id, userId: activity.userId, name: users.name, text: activity.text, createdAt: activity.createdAt })
    .from(activity)
    .innerJoin(users, eq(users.id, activity.userId))
    .where(eq(activity.officeId, officeId))
    .orderBy(desc(activity.seq))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, userId: r.userId, name: r.name, text: r.text, at: r.createdAt.getTime() }));
}
