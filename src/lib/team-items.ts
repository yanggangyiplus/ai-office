import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { members, offices, teamItems, users } from "@/db/schema";
import { logActivity } from "./activity";
import { ValidationError } from "./errors";
import { ForbiddenError, isMember } from "./offices";

import { ITEM_KINDS, MAX_ITEM_CHARS, MAX_PER_KIND, MAX_TODAY_CHARS, type ItemKind, type TeamItem } from "./team-items-meta";

export { MAX_PER_KIND }; // re-exported for tests and callers

async function requireMember(db: Db, officeId: string, userId: string) {
  if (!(await isMember(db, officeId, userId))) throw new ForbiddenError("members only");
}

export async function listItems(db: Db, officeId: string, userId: string): Promise<TeamItem[]> {
  await requireMember(db, officeId, userId);
  const rows = await db
    .select({ id: teamItems.id, kind: teamItems.kind, title: teamItems.title, url: teamItems.url, by: teamItems.createdBy, name: users.name, at: teamItems.createdAt })
    .from(teamItems)
    .innerJoin(users, eq(users.id, teamItems.createdBy))
    .where(eq(teamItems.officeId, officeId))
    .orderBy(asc(teamItems.createdAt));
  return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, url: r.url, authorName: r.name, mine: r.by === userId, at: r.at.getTime() }));
}

export async function addItem(db: Db, officeId: string, userId: string, input: { kind: unknown; title: unknown; url?: unknown }): Promise<void> {
  await requireMember(db, officeId, userId);
  const kind = input?.kind;
  if (typeof kind !== "string" || !(ITEM_KINDS as readonly string[]).includes(kind)) throw new ValidationError("unknown kind");
  let title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length > MAX_ITEM_CHARS) throw new ValidationError(`text is longer than ${MAX_ITEM_CHARS} characters`);
  let url: string | null = null;
  if (kind === "link") {
    let u: URL;
    try {
      u = new URL(String(input.url ?? ""));
    } catch {
      throw new ValidationError("link is not a valid address");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new ValidationError("only http and https links are allowed");
    url = u.toString();
    title ||= u.host;
  }
  if (!title) throw new ValidationError("text is empty");
  const have = await db.select({ id: teamItems.id }).from(teamItems).where(and(eq(teamItems.officeId, officeId), eq(teamItems.kind, kind as ItemKind)));
  if (have.length >= MAX_PER_KIND) throw new ValidationError(`at most ${MAX_PER_KIND} items of one kind`);
  await db.insert(teamItems).values({ officeId, kind: kind as ItemKind, title, url, createdBy: userId });
  if (kind === "notice") await logActivity(db, officeId, userId, `공지를 올렸어요 · ${title.slice(0, 40)}`);
}

// The author or the team admin may remove an item.
export async function removeItem(db: Db, officeId: string, userId: string, itemId: string): Promise<void> {
  await requireMember(db, officeId, userId);
  const [item] = await db.select().from(teamItems).where(eq(teamItems.id, itemId)).catch(() => []);
  if (!item || item.officeId !== officeId) throw new ValidationError("no such item in this team");
  const [o] = await db.select({ adminId: offices.adminId }).from(offices).where(eq(offices.id, officeId));
  if (item.createdBy !== userId && o?.adminId !== userId) throw new ForbiddenError("only the author or the admin can remove this");
  await db.delete(teamItems).where(eq(teamItems.id, itemId));
}

export async function setToday(db: Db, officeId: string, userId: string, text: unknown): Promise<void> {
  await requireMember(db, officeId, userId);
  if (typeof text !== "string") throw new ValidationError("today must be text");
  const t = text.trim();
  if (t.length > MAX_TODAY_CHARS) throw new ValidationError(`today is longer than ${MAX_TODAY_CHARS} characters`);
  await db.update(members).set({ today: t }).where(and(eq(members.officeId, officeId), eq(members.userId, userId)));
}
