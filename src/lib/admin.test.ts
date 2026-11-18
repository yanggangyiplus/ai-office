import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/db/testdb";
import type { Db } from "@/db";
import { saveConnection } from "./connections";
import { addItem } from "./team-items";
import { adminOverview, isAdminEmail, systemChecks } from "./admin";
import { createInvite, createOffice, joinByInvite, upsertUser } from "./offices";
import { createNotesMeeting } from "./meetings";

describe("isAdminEmail", () => {
  it("matches the listed addresses ignoring case and spaces", () => {
    const env = { ADMIN_EMAILS: " Boss@Example.com , second@x.io " };
    expect(isAdminEmail("boss@example.com", env)).toBe(true);
    expect(isAdminEmail("SECOND@x.io", env)).toBe(true);
  });
  it("is false for anyone else, for no address, and when nothing is configured", () => {
    expect(isAdminEmail("other@x.io", { ADMIN_EMAILS: "boss@example.com" })).toBe(false);
    expect(isAdminEmail(undefined, { ADMIN_EMAILS: "boss@example.com" })).toBe(false);
    expect(isAdminEmail("boss@example.com", {})).toBe(false);
    expect(isAdminEmail("", { ADMIN_EMAILS: "" })).toBe(false);
  });
});

describe("systemChecks", () => {
  it("reports configured or missing for each setting without exposing values", () => {
    const checks = systemChecks({ NODE_ENV: "production", AUTH_SECRET: "s3cret", AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "gs", ABLY_API_KEY: "" });
    const by = Object.fromEntries(checks.map((c) => [c.key, c.ok]));
    expect(by).toMatchObject({ AUTH_SECRET: true, google: true, ABLY_API_KEY: false, ANTHROPIC_API_KEY: false, TOKEN_ENCRYPTION_KEY: false });
    expect(JSON.stringify(checks)).not.toContain("s3cret");
    expect(JSON.stringify(checks)).not.toContain("gs");
  });
  it("flags the dev test login when it is switched on in production", () => {
    const warn = systemChecks({ NODE_ENV: "production", AUTH_TEST_LOGIN: "1" }).find((c) => c.key === "AUTH_TEST_LOGIN");
    expect(warn?.ok).toBe(false);
    expect(systemChecks({ NODE_ENV: "production" }).find((c) => c.key === "AUTH_TEST_LOGIN")?.ok).toBe(true);
  });
});

describe("adminOverview", () => {
  let db: Db;
  beforeEach(async () => {
    db = await makeTestDb();
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    await upsertUser(db, { id: "a", email: "a@x.c", name: "관리자" });
    await upsertUser(db, { id: "m", email: "m@x.c", name: "민수" });
    await upsertUser(db, { id: "lone", email: "l@x.c", name: "혼자" });
    const team = await createOffice(db, "a", "팀A");
    await joinByInvite(db, await createInvite(db, team.id), "m", "minsu");
    await createNotesMeeting(db, team.id, "a", "킥오프");
    await addItem(db, team.id, "a", { kind: "notice", title: "공지" });
    await saveConnection(db, "a", "github", "ghp_supersecrettoken");
  });

  it("counts people, teams and meetings", async () => {
    const o = await adminOverview(db);
    expect(o.totals).toMatchObject({ users: 3, teams: 1, meetings: 1 });
    expect(o.teams[0]).toMatchObject({ name: "팀A", adminName: "관리자", members: 2, meetings: 1 });
  });

  it("lists every user with their team count and which services they connected", async () => {
    const o = await adminOverview(db);
    const a = o.users.find((u) => u.id === "a")!;
    expect(a).toMatchObject({ name: "관리자", email: "a@x.c", teams: 1, github: true, notion: false });
    expect(o.users.find((u) => u.id === "lone")).toMatchObject({ teams: 0, github: false });
  });

  it("never contains a stored token", async () => {
    const o = await adminOverview(db);
    expect(JSON.stringify(o)).not.toContain("ghp_supersecrettoken");
    expect(JSON.stringify(o)).not.toMatch(/token/i);
  });

  it("includes the latest activity across teams, newest first", async () => {
    const o = await adminOverview(db);
    expect(o.recent.length).toBeGreaterThan(0);
    expect(o.recent[0]).toMatchObject({ teamName: "팀A" });
    expect(o.recent.map((r) => r.at)).toEqual([...o.recent.map((r) => r.at)].sort((x, y) => y - x));
  });
});
