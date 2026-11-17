import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/db/testdb";
import { meetings, members, messages, offices, todos, users } from "@/db/schema";
import { buildBoard } from "./board";
import { recentActivity } from "./activity";
import { presenceOf } from "./attendance";
import { DEMO_TEAM_NAME, demoMode, demoSummarize, demoWork, seedDemo } from "./demo";

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

  it("gives members roles, an office presence mix, a feed and a meeting written in the site", async () => {
    const db = await makeTestDb();
    await seedDemo(db);
    const [team] = await db.select().from(offices).where(eq(offices.name, DEMO_TEAM_NAME));
    const ms = await db.select().from(members).where(eq(members.officeId, team.id));
    expect(ms.every((m) => m.roles.length > 0)).toBe(true);
    expect(ms.some((m) => m.roles.length > 1)).toBe(true);
    const presence = await presenceOf(db, team.id);
    const present = [...presence.values()].filter((p) => p.present);
    expect(present.length).toBeGreaterThan(0);
    expect(present.length).toBeLessThan(ms.length); // somebody is not at work
    expect(present.some((p) => p.status !== "working")).toBe(true); // somebody is in a meeting / at lunch
    expect((await recentActivity(db, team.id, "test:양강이")).length).toBeGreaterThan(3);
    const mine = (await db.select().from(meetings).where(eq(meetings.officeId, team.id))).find((m) => m.notionPageId === null);
    expect(mine?.notes.length).toBeGreaterThan(20);
    expect(mine?.links.length).toBeGreaterThan(0);
    expect((await db.select().from(todos)).some((t) => t.role)).toBe(true);
  });

  it("is safe to run twice", async () => {
    const db = await makeTestDb();
    await seedDemo(db);
    await seedDemo(db);
    expect(await db.select().from(offices).where(eq(offices.name, DEMO_TEAM_NAME))).toHaveLength(1);
  });
});

describe("demoSummarize (a stand-in for the AI so the notes flow can be tried without a key)", () => {
  const notes = [
    "10:00 시작",
    "10:05 로그인 화면은 이번 주 안에 끝내기로 함",
    "10:10 홍보 문구는 하늘이 맡기로 함",
    "10:15 디자인 톤은 쿨그레이로 결정",
  ].join("\n");

  it("turns decision-like lines into decisions and task-like lines into todos", () => {
    const s = demoSummarize(notes);
    expect(s.decisions).toContain("디자인 톤은 쿨그레이로 결정");
    expect(s.todos.map((t) => t.title)).toEqual(["로그인 화면은 이번 주 안에 끝내기로 함", "홍보 문구는 하늘이 맡기로 함"]);
  });
  it("finds who was named and guesses a role from the words", () => {
    const todos = demoSummarize(notes).todos;
    expect(todos[1]).toMatchObject({ assigneeName: "하늘", role: "마케팅" });
    expect(todos[0]).toMatchObject({ assigneeName: null, role: "개발" });
  });
  it("strips the leading time from lines", () => {
    expect(demoSummarize("9:30 시연은 금요일로 결정").decisions).toEqual(["시연은 금요일로 결정"]);
  });
  it("returns nothing for empty notes", () => {
    expect(demoSummarize("  \n ")).toEqual({ decisions: [], todos: [] });
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
