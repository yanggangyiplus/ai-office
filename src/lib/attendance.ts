import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { attendance, members } from "@/db/schema";
import { logActivity } from "./activity";
import { ValidationError } from "./errors";
import { ForbiddenError, isMember } from "./offices";

export const STATUSES = ["working", "meeting", "away", "meal"] as const;
export type Status = (typeof STATUSES)[number];

const STATUS_TEXT: Record<Status, string> = {
  working: "다시 자리에 앉았어요",
  meeting: "회의 중이에요",
  away: "자리를 비웠어요",
  meal: "식사하러 갔어요",
};

async function requireMember(db: Db, officeId: string, userId: string) {
  if (!(await isMember(db, officeId, userId))) throw new ForbiddenError("members only");
}

const openRow = (db: Db, officeId: string, userId: string) =>
  db
    .select({ id: attendance.id })
    .from(attendance)
    .where(and(eq(attendance.officeId, officeId), eq(attendance.userId, userId), isNull(attendance.checkedOutAt)));

export async function checkIn(db: Db, officeId: string, userId: string): Promise<void> {
  await requireMember(db, officeId, userId);
  if ((await openRow(db, officeId, userId)).length) return; // already at work
  await db.insert(attendance).values({ officeId, userId });
  await db.update(members).set({ status: "working" }).where(and(eq(members.officeId, officeId), eq(members.userId, userId)));
  await logActivity(db, officeId, userId, "출근했어요");
}

export async function checkOut(db: Db, officeId: string, userId: string): Promise<void> {
  await requireMember(db, officeId, userId);
  const open = await openRow(db, officeId, userId);
  if (!open.length) return;
  await db.update(attendance).set({ checkedOutAt: new Date() }).where(eq(attendance.id, open[0].id));
  await db.update(members).set({ status: "working" }).where(and(eq(members.officeId, officeId), eq(members.userId, userId)));
  await logActivity(db, officeId, userId, "퇴근했어요");
}

// Only you can change your own status, and only while you are checked in.
export async function setStatus(db: Db, officeId: string, userId: string, status: unknown): Promise<void> {
  await requireMember(db, officeId, userId);
  if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) throw new ValidationError("unknown status");
  if (!(await openRow(db, officeId, userId)).length) throw new ValidationError("check in first");
  await db.update(members).set({ status: status as Status }).where(and(eq(members.officeId, officeId), eq(members.userId, userId)));
  await logActivity(db, officeId, userId, STATUS_TEXT[status as Status]);
}

export async function presenceOf(db: Db, officeId: string): Promise<Map<string, { present: boolean; status: Status }>> {
  const rows = await db.select({ userId: members.userId, status: members.status }).from(members).where(eq(members.officeId, officeId));
  const open = await db
    .select({ userId: attendance.userId })
    .from(attendance)
    .where(and(eq(attendance.officeId, officeId), isNull(attendance.checkedOutAt)));
  const here = new Set(open.map((o) => o.userId));
  return new Map(rows.map((r) => [r.userId, { present: here.has(r.userId), status: r.status }]));
}
