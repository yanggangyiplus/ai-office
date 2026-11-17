import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/db/testdb";
import { meetings, todos } from "@/db/schema";
import type { Db } from "@/db";
import { createInvite, createOffice, joinByInvite, saveSettings, upsertUser } from "./offices";
import { NotionLinkError } from "./notion";
import {
  AlreadyConfirmedError,
  confirmMeeting,
  editTodos,
  regenerate,
  registerMeeting,
  type MeetingDeps,
} from "./meetings";

let db: Db;
let officeId: string;

const deps = (over: Partial<MeetingDeps> = {}): MeetingDeps => ({
  fetchText: async () => ({ pageId: "p1", title: "주간 회의", text: "본문" }),
  summarize: async () => ({
    decisions: ["A로 간다"],
    todos: [
      { title: "API", assigneeName: "민수", description: "d" },
      { title: "디자인", assigneeName: "없는사람" },
    ],
  }),
  ...over,
});

beforeEach(async () => {
  db = await makeTestDb();
  await upsertUser(db, { id: "admin", email: "a@x.c", name: "Admin" });
  await upsertUser(db, { id: "m1", email: "m@x.c", name: "민수" });
  await upsertUser(db, { id: "out", email: "o@x.c", name: "외부" });
  officeId = (await createOffice(db, "admin", "팀")).id;
  await joinByInvite(db, await createInvite(db, officeId), "m1", "minsu");
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  await saveSettings(db, officeId, "admin", { defaultRepo: "o/r", repos: ["o/r"] });
});

const todosOf = (id: string) => db.select().from(todos).where(eq(todos.meetingId, id));

describe("registerMeeting", () => {
  it("creates a draft with matched assignees and the default repo", async () => {
    const { meetingId } = await registerMeeting(db, deps(), officeId, "m1", "https://notion.so/x");
    const [m] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
    const ts = await todosOf(meetingId);
    expect(m.status).toBe("draft");
    expect(m.summary.decisions).toEqual(["A로 간다"]);
    expect(ts.find((t) => t.title === "API")).toMatchObject({ assigneeUserId: "m1", repo: "o/r" });
    expect(ts.find((t) => t.title === "디자인")!.assigneeUserId).toBeNull();
  });

  it("rejects non-members", async () => {
    await expect(registerMeeting(db, deps(), officeId, "out", "u")).rejects.toThrow();
  });

  it("creates no meeting when the notion link is rejected", async () => {
    const bad = deps({ fetchText: async () => { throw new NotionLinkError("not_under_parent"); } });
    await expect(registerMeeting(db, bad, officeId, "m1", "u")).rejects.toBeInstanceOf(NotionLinkError);
    expect(await db.select().from(meetings)).toHaveLength(0);
  });
});

describe("confirm flow", () => {
  it("lets the uploader confirm, then refuses a second confirm", async () => {
    const { meetingId } = await registerMeeting(db, deps(), officeId, "m1", "u");
    await confirmMeeting(db, meetingId, "m1");
    const [m] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
    expect(m.status).toBe("confirmed");
    await expect(confirmMeeting(db, meetingId, "admin")).rejects.toBeInstanceOf(AlreadyConfirmedError);
  });

  it("refuses to regenerate a confirmed meeting and keeps its todos", async () => {
    const { meetingId } = await registerMeeting(db, deps(), officeId, "m1", "u");
    await confirmMeeting(db, meetingId, "m1");
    await expect(regenerate(db, deps(), meetingId, "m1")).rejects.toBeInstanceOf(AlreadyConfirmedError);
    expect(await todosOf(meetingId)).toHaveLength(2);
  });

  it("regenerate replaces a draft's todos", async () => {
    const { meetingId } = await registerMeeting(db, deps(), officeId, "m1", "u");
    const again = deps({ summarize: async () => ({ decisions: [], todos: [{ title: "새 일", assigneeName: null }] }) });
    await regenerate(db, again, meetingId, "m1");
    expect((await todosOf(meetingId)).map((t) => t.title)).toEqual(["새 일"]);
  });

  it("editTodos replaces todos and works after confirmation", async () => {
    const { meetingId } = await registerMeeting(db, deps(), officeId, "m1", "u");
    await confirmMeeting(db, meetingId, "m1");
    await editTodos(db, meetingId, "admin", [{ title: "고친 일", assigneeUserId: "admin", repo: "o/r" }]);
    expect((await todosOf(meetingId)).map((t) => t.title)).toEqual(["고친 일"]);
  });

  it("editTodos rejects non-members", async () => {
    const { meetingId } = await registerMeeting(db, deps(), officeId, "m1", "u");
    await expect(editTodos(db, meetingId, "out", [])).rejects.toThrow();
  });
});
