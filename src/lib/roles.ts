import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { members } from "@/db/schema";
import { ValidationError } from "./errors";
import { ForbiddenError, isMember, requireAdmin } from "./offices";

export const PRESET_ROLES = ["PO", "기획", "디자인", "개발", "마케팅", "QA"];
export const MAX_ROLES = 5;
export const MAX_ROLE_CHARS = 12;

export function normalizeRole(input: unknown): string {
  if (typeof input !== "string") throw new ValidationError("role must be text");
  const role = input.trim();
  if (!role) throw new ValidationError("role is empty");
  if (role.length > MAX_ROLE_CHARS) throw new ValidationError(`role is longer than ${MAX_ROLE_CHARS} characters`);
  return role;
}

// Trims, removes duplicates (ignoring case) and enforces the limits.
export function normalizeRoles(input: unknown): string[] {
  if (!Array.isArray(input)) throw new ValidationError("roles must be a list");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    const role = normalizeRole(item);
    const key = role.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(role);
    }
  }
  if (out.length > MAX_ROLES) throw new ValidationError(`at most ${MAX_ROLES} roles`);
  return out;
}

// You can set your own roles; the team admin can set anyone's.
export async function setRoles(db: Db, officeId: string, actorId: string, targetId: string, roles: unknown): Promise<string[]> {
  if (!(await isMember(db, officeId, actorId)) || !(await isMember(db, officeId, targetId))) {
    throw new ForbiddenError("members only");
  }
  if (actorId !== targetId) await requireAdmin(db, officeId, actorId);
  const clean = normalizeRoles(roles);
  await db.update(members).set({ roles: clean }).where(and(eq(members.officeId, officeId), eq(members.userId, targetId)));
  return clean;
}

// Everyone who has the role, so a todo with that role can offer them as the assignee.
export function suggestAssignees(role: string | null | undefined, ms: { userId: string; roles: string[] }[]): string[] {
  if (!role) return [];
  const key = role.trim().toLowerCase();
  return ms.filter((m) => m.roles.some((r) => r.toLowerCase() === key)).map((m) => m.userId);
}
