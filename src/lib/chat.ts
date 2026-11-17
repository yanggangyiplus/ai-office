import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { messages, users } from "@/db/schema";
import { ValidationError } from "./errors";
import { ForbiddenError, isMember } from "./offices";
import type { ChatMessage } from "./realtime/types";

export const MAX_CHAT_CHARS = 500;
export const RECENT_CHAT_LIMIT = 100;

type Row = { id: string; userId: string; name: string; body: string; createdAt: Date };
const toMessage = (r: Row): ChatMessage => ({ id: r.id, userId: r.userId, name: r.name, body: r.body, at: r.createdAt.getTime() });

// Checks membership and length, saves, then hands the saved message to `publish` (Ably in production).
export async function sendChat(
  db: Db,
  publish: (teamId: string, m: ChatMessage) => Promise<void>,
  officeId: string,
  userId: string,
  body: string,
): Promise<ChatMessage> {
  if (!(await isMember(db, officeId, userId))) throw new ForbiddenError("members only");
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) throw new ValidationError("message is empty");
  if (text.length > MAX_CHAT_CHARS) throw new ValidationError(`message is longer than ${MAX_CHAT_CHARS} characters`);
  const [saved] = await db.insert(messages).values({ officeId, userId, body: text }).returning();
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  const m = toMessage({ ...saved, name: u?.name ?? "" });
  await publish(officeId, m);
  return m;
}

// Latest messages, oldest first, for showing history when someone enters the team space.
export async function recentChat(db: Db, officeId: string, userId: string, limit = RECENT_CHAT_LIMIT): Promise<ChatMessage[]> {
  if (!(await isMember(db, officeId, userId))) throw new ForbiddenError("members only");
  const rows = await db
    .select({ id: messages.id, userId: messages.userId, name: users.name, body: messages.body, createdAt: messages.createdAt })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.userId))
    .where(eq(messages.officeId, officeId))
    .orderBy(desc(messages.seq))
    .limit(limit);
  return rows.reverse().map(toMessage);
}
