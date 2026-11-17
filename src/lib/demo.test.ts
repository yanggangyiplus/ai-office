import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/db/testdb";
import { meetings, members, messages, offices, todos, users } from "@/db/schema";
import { buildBoard } from "./board";
import { DEMO_TEAM_NAME, demoMode, demoWork, seedDemo } from "./demo";

describe("demoMode (dev-only sample data)", () => {
  it("is off unless SEED_DEMO=1", () => {
    expect(demoMode({ NODE_ENV: "development" })).toBe(false);
  });
  it("is on in development with the flag", () => {
    expect(demoMode({ NODE_ENV: "development", SEED_DEMO: "1" })).toBe(true);
  });
  it("is never on in production or on Vercel, even with the flag", () => {
    expect(demoMode({ NODE_ENV: "production", SEED_DEMO: "1" })).toBe(false);
    expect(demoMode({ NODE_ENV: "development", SEED_DEMO: "1", VERCEL_ENV: "preview" })).toBe(false);
  });
});

describe("seedDemo", () => {
  it("creates a team owned by the test login user with members, meetings, todos and chat", async () => {
    const db = await makeTestDb();
    await seedDemo(db);
    const [team] = await db.select().from(offices).where(eq(offices.name, DEMO_TEAM_NAME));
    expect(team.adminId).toBe("test:양강이");
    expect(team.repos.length).toBeGreaterThan(0);
    expect(await db.select().from(members).where(eq(members.officeId, team.id))).toHaveLength(5);
    const ms = await db.select().from(meetings).where(eq(meetings.officeId, team.id));
    expect(ms.length).toBeGreaterThanOrEqual(3);
    expect(ms.some((m) => m.status === "confirmed")).toBe(true);
    expect(ms.some((m) => m.status === "draft")).toBe(true);
    expect((await db.select().from(todos)).length).toBeGreaterThan(0);
    expect((await db.select().from(messages)).length).toBeGreaterThan(0);
  });

  it("is safe to run twice", async () => {
    const db = await makeTestDb();
    await seedDemo(db);
    await seedDemo(db);
    expect(await db.select().from(offices).where(eq(offices.name, DEMO_TEAM_NAME))).toHaveLength(1);
  });
});

describe("demoWork", () => {
  it("gives every demo member work in all three states on the board", async () => {
    const db = await makeTestDb();
    await seedDemo(db);
    const people = await db.select({ userId: users.id, name: users.name, githubUsername: users.githubUsername }).from(users);
    const board = buildBoard(demoWork(["demo/app"]), people.map((p) => ({ ...p, githubUsername: p.githubUsername ?? "" })));
    expect(board).toHaveLength(5);
    for (const row of board) expect(row.doing.length + row.next.length + row.done.length).toBeGreaterThan(0);
    expect(board.some((r) => r.doing.length > 0)).toBe(true);
    expect(board.some((r) => r.next.length > 0)).toBe(true);
    expect(board.some((r) => r.done.length > 0)).toBe(true);
  });
});
