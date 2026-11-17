import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeTestDb } from "@/db/testdb";
import { members } from "@/db/schema";
import type { Db } from "@/db";
import { ValidationError } from "./errors";
import { createInvite, createOffice, ForbiddenError, joinByInvite, upsertUser } from "./offices";
import { PRESET_ROLES, normalizeRoles, setRoles, suggestAssignees } from "./roles";

let db: Db;
let teamId: string;
const rolesOf = async (userId: string) =>
  (await db.select().from(members).where(and(eq(members.officeId, teamId), eq(members.userId, userId))))[0].roles;

beforeEach(async () => {
  db = await makeTestDb();
  await upsertUser(db, { id: "admin", email: "a@x.c", name: "관리자" });
  await upsertUser(db, { id: "m1", email: "m@x.c", name: "민수" });
  await upsertUser(db, { id: "m2", email: "n@x.c", name: "지은" });
  await upsertUser(db, { id: "out", email: "o@x.c", name: "외부" });
  teamId = (await createOffice(db, "admin", "팀")).id;
  const code = await createInvite(db, teamId);
  await joinByInvite(db, code, "m1", "minsu");
  await joinByInvite(db, code, "m2", "jieun");
});

describe("normalizeRoles", () => {
  it("offers the preset roles", () => {
    expect(PRESET_ROLES).toEqual(["PO", "기획", "디자인", "개발", "마케팅", "QA"]);
  });
  it("trims and removes duplicates ignoring case", () => {
    expect(normalizeRoles(["개발", " 개발 ", "dev", "DEV", "QA"])).toEqual(["개발", "dev", "QA"]);
  });
  it("accepts an empty list (clearing roles)", () => {
    expect(normalizeRoles([])).toEqual([]);
  });
  it("accepts exactly 5 roles and 12 characters", () => {
    expect(normalizeRoles(["a", "b", "c", "d", "가".repeat(12)])).toHaveLength(5);
  });
  it.each([
    ["more than 5 roles", ["a", "b", "c", "d", "e", "f"]],
    ["a role over 12 characters", ["가".repeat(13)]],
    ["an empty role", ["개발", "  "]],
    ["a non-string role", ["개발", 3]],
    ["not an array", "개발"],
    ["null", null],
  ])("rejects %s", (_n, input) => {
    expect(() => normalizeRoles(input)).toThrow(ValidationError);
  });
});

describe("setRoles", () => {
  it("lets a member set their own roles", async () => {
    expect(await setRoles(db, teamId, "m1", "m1", ["개발", "QA"])).toEqual(["개발", "QA"]);
    expect(await rolesOf("m1")).toEqual(["개발", "QA"]);
  });
  it("lets the admin set someone else's roles", async () => {
    await setRoles(db, teamId, "admin", "m2", ["디자인"]);
    expect(await rolesOf("m2")).toEqual(["디자인"]);
  });
  it("refuses a regular member changing another member's roles", async () => {
    await expect(setRoles(db, teamId, "m1", "m2", ["PO"])).rejects.toBeInstanceOf(ForbiddenError);
    expect(await rolesOf("m2")).toEqual([]);
  });
  it("refuses a non-member actor and a non-member target", async () => {
    await expect(setRoles(db, teamId, "out", "out", ["개발"])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setRoles(db, teamId, "admin", "out", ["개발"])).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("keeps the stored roles when the new ones are invalid", async () => {
    await setRoles(db, teamId, "m1", "m1", ["개발"]);
    await expect(setRoles(db, teamId, "m1", "m1", ["a", "b", "c", "d", "e", "f"])).rejects.toBeInstanceOf(ValidationError);
    expect(await rolesOf("m1")).toEqual(["개발"]);
  });
});

describe("suggestAssignees", () => {
  const ms = [
    { userId: "a", roles: ["개발", "QA"] },
    { userId: "b", roles: ["디자인"] },
    { userId: "c", roles: ["dev"] },
  ];
  it("returns everyone with the role, ignoring case", () => {
    expect(suggestAssignees("개발", ms)).toEqual(["a"]);
    expect(suggestAssignees("DEV", ms)).toEqual(["c"]);
  });
  it("returns nothing for no role or an unknown role", () => {
    expect(suggestAssignees(null, ms)).toEqual([]);
    expect(suggestAssignees(undefined, ms)).toEqual([]);
    expect(suggestAssignees("마케팅", ms)).toEqual([]);
  });
});
