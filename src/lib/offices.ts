import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { invites, members, offices, users } from "@/db/schema";
import { encrypt } from "./crypto";

export class ForbiddenError extends Error {}

export async function upsertUser(db: Db, u: { id: string; email: string; name: string }) {
  await db.insert(users).values(u).onConflictDoUpdate({ target: users.id, set: { email: u.email, name: u.name } });
}

export async function createOffice(db: Db, userId: string, name: string): Promise<{ id: string }> {
  const [o] = await db.insert(offices).values({ name, adminId: userId }).returning({ id: offices.id });
  await db.insert(members).values({ officeId: o.id, userId });
  return o;
}

export async function createInvite(db: Db, officeId: string): Promise<string> {
  const code = randomBytes(9).toString("base64url");
  await db.insert(invites).values({ code, officeId });
  return code;
}

export async function joinByInvite(
  db: Db,
  code: string,
  userId: string,
  githubUsername: string,
): Promise<{ officeId: string }> {
  const [inv] = await db.select().from(invites).where(eq(invites.code, code));
  if (!inv) throw new Error("invalid invite");
  await db.insert(members).values({ officeId: inv.officeId, userId }).onConflictDoNothing();
  await db.update(users).set({ githubUsername }).where(eq(users.id, userId));
  return { officeId: inv.officeId };
}

export async function isMember(db: Db, officeId: string, userId: string): Promise<boolean> {
  const r = await db.select().from(members).where(and(eq(members.officeId, officeId), eq(members.userId, userId)));
  return r.length > 0;
}

export async function requireAdmin(db: Db, officeId: string, userId: string): Promise<void> {
  const [o] = await db.select({ adminId: offices.adminId }).from(offices).where(eq(offices.id, officeId));
  if (!o || o.adminId !== userId) throw new ForbiddenError("admin only");
}

export async function saveSettings(
  db: Db,
  officeId: string,
  userId: string,
  s: { notionToken?: string; notionParentPageId?: string; githubToken?: string; repos?: string[]; defaultRepo?: string },
): Promise<void> {
  await requireAdmin(db, officeId, userId);
  const set: Partial<typeof offices.$inferInsert> = {};
  if (s.notionToken) set.notionToken = encrypt(s.notionToken);
  if (s.githubToken) set.githubToken = encrypt(s.githubToken);
  if (s.notionParentPageId) set.notionParentPageId = s.notionParentPageId;
  if (s.repos) set.repos = s.repos;
  if (s.defaultRepo) set.defaultRepo = s.defaultRepo;
  if (Object.keys(set).length) await db.update(offices).set(set).where(eq(offices.id, officeId));
}
