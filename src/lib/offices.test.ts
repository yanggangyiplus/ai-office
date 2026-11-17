import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/db/testdb";
import { members, offices, users } from "@/db/schema";
import type { Db } from "@/db";
import { decrypt } from "./crypto";
import {
  ForbiddenError,
  createInvite,
  createOffice,
  joinByInvite,
  removeMember,
  saveSettings,
  upsertUser,
} from "./offices";

let db: Db;

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

beforeEach(async () => {
  db = await makeTestDb();
  await upsertUser(db, { id: "admin", email: "a@x.c", name: "Admin" });
  await upsertUser(db, { id: "m1", email: "m@x.c", name: "Member" });
});

describe("offices", () => {
  it("makes the creator both admin and member", async () => {
    const { id } = await createOffice(db, "admin", "팀");
    const [o] = await db.select().from(offices).where(eq(offices.id, id));
    const ms = await db.select().from(members).where(eq(members.officeId, id));
    expect(o.adminId).toBe("admin");
    expect(ms.map((m) => m.userId)).toEqual(["admin"]);
  });

  it("records the creator's github username so the admin appears on the board", async () => {
    await createOffice(db, "admin", "팀", "admin-gh");
    const [u] = await db.select().from(users).where(eq(users.id, "admin"));
    expect(u.githubUsername).toBe("admin-gh");
  });

  it("lets the admin remove a member, but nobody else, and never the admin", async () => {
    const { id } = await createOffice(db, "admin", "팀");
    await joinByInvite(db, await createInvite(db, id), "m1", "mgit");
    await expect(removeMember(db, id, "m1", "admin")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeMember(db, id, "admin", "admin")).rejects.toThrow();
    await removeMember(db, id, "admin", "m1");
    const ms = await db.select().from(members).where(eq(members.officeId, id));
    expect(ms.map((m) => m.userId)).toEqual(["admin"]);
  });

  it("does not duplicate a member who opens the invite twice", async () => {
    const { id } = await createOffice(db, "admin", "팀");
    const code = await createInvite(db, id);
    await joinByInvite(db, code, "m1", "mgit");
    const r = await joinByInvite(db, code, "m1", "mgit");
    const ms = await db.select().from(members).where(eq(members.officeId, id));
    expect(r.officeId).toBe(id);
    expect(ms).toHaveLength(2);
  });

  it("rejects an unknown invite code", async () => {
    await expect(joinByInvite(db, "nope", "m1", "mgit")).rejects.toThrow();
  });

  it("forbids non-admin members from saving settings", async () => {
    const { id } = await createOffice(db, "admin", "팀");
    const code = await createInvite(db, id);
    await joinByInvite(db, code, "m1", "mgit");
    await expect(saveSettings(db, id, "m1", { githubToken: "t" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("stores the github token encrypted", async () => {
    const { id } = await createOffice(db, "admin", "팀");
    await saveSettings(db, id, "admin", { githubToken: "ghp_plain", repos: ["o/r"], defaultRepo: "o/r" });
    const [o] = await db.select().from(offices).where(eq(offices.id, id));
    expect(o.githubToken).not.toBe("ghp_plain");
    expect(decrypt(o.githubToken!)).toBe("ghp_plain");
    expect(o.repos).toEqual(["o/r"]);
  });
});
