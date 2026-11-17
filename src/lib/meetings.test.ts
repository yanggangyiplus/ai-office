import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/db/testdb";
import { meetings, todos } from "@/db/schema";
import type { Db } from "@/db";
import { ForbiddenError, createInvite, createOffice, joinByInvite, removeMember, saveSettings, upsertUser } from "./offices";
import { recentActivity } from "./activity";
import { setRoles } from "./roles";
import { NotionLinkError } from "./notion";
import { NotConnectedError, saveConnection } from "./connections";
import { TeamSetupError, ValidationError } from "./errors";
import {
  AlreadyConfirmedError,
  addLink,
  confirmMeeting,
  createNotesMeeting,
  editTodos,
  makeDeps,
  meetingRequest,
  officeMembers,
  regenerate,
  registerMeeting,
  saveNotes,
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

describe("officeMembers", () => {
  it("returns each member's join time so desks can be assigned in order", async () => {
    const ms = await officeMembers(db, officeId);
    expect(ms.map((m) => m.userId).sort()).toEqual(["admin", "m1"]);
    for (const m of ms) expect(m.joinedAt).toBeInstanceOf(Date);
  });
});

describe("notes meetings (written in the site)", () => {
  const notesDeps = (seen: string[]): MeetingDeps => ({
    fetchText: async () => { throw new Error("must not read Notion for a notes meeting"); },
    summarize: async (text) => {
      seen.push(text);
      return { decisions: ["메모에서 나온 결정"], todos: [{ title: "메모에서 나온 할 일", assigneeName: "민수" }] };
    },
  });

  it("lets a member start a notes meeting that has no Notion page", async () => {
    const { meetingId } = await createNotesMeeting(db, officeId, "m1", "  디자인 리뷰  ");
    const [m] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
    expect(m).toMatchObject({ title: "디자인 리뷰", status: "draft", notionPageId: null, notes: "" });
    expect(m.links).toEqual([]);
  });

  it("refuses non-members and empty or very long titles", async () => {
    await expect(createNotesMeeting(db, officeId, "out", "x")).rejects.toThrow();
    await expect(createNotesMeeting(db, officeId, "m1", "   ")).rejects.toBeInstanceOf(ValidationError);
    await expect(createNotesMeeting(db, officeId, "m1", "가".repeat(101))).rejects.toBeInstanceOf(ValidationError);
  });

  it("saves notes while the meeting is a draft, and refuses after it is confirmed", async () => {
    const { meetingId } = await createNotesMeeting(db, officeId, "m1", "회의");
    await saveNotes(db, meetingId, "m1", "10:02 목표 확인");
    expect((await db.select().from(meetings).where(eq(meetings.id, meetingId)))[0].notes).toBe("10:02 목표 확인");
    await confirmMeeting(db, meetingId, "admin");
    await expect(saveNotes(db, meetingId, "m1", "너무 늦은 메모")).rejects.toBeInstanceOf(AlreadyConfirmedError);
  });

  it("refuses notes from non-members and notes over the limit", async () => {
    const { meetingId } = await createNotesMeeting(db, officeId, "m1", "회의");
    await expect(saveNotes(db, meetingId, "out", "x")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveNotes(db, meetingId, "m1", "가".repeat(20_001))).rejects.toBeInstanceOf(ValidationError);
  });

  it("turns the notes into decisions and todos without touching Notion", async () => {
    const { meetingId } = await createNotesMeeting(db, officeId, "m1", "회의");
    await saveNotes(db, meetingId, "m1", "오늘은 시연 준비를 하기로 했다");
    const seen: string[] = [];
    await regenerate(db, notesDeps(seen), meetingId, "m1");
    expect(seen).toEqual(["오늘은 시연 준비를 하기로 했다"]);
    expect((await db.select().from(meetings).where(eq(meetings.id, meetingId)))[0].summary.decisions).toEqual(["메모에서 나온 결정"]);
    expect((await todosOf(meetingId))[0]).toMatchObject({ title: "메모에서 나온 할 일", assigneeUserId: "m1" });
  });

  it("asks for notes first when there is nothing to summarize", async () => {
    const { meetingId } = await createNotesMeeting(db, officeId, "m1", "회의");
    await expect(regenerate(db, notesDeps([]), meetingId, "m1")).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not regenerate a confirmed notes meeting", async () => {
    const { meetingId } = await createNotesMeeting(db, officeId, "m1", "회의");
    await saveNotes(db, meetingId, "m1", "내용");
    await confirmMeeting(db, meetingId, "m1");
    await expect(regenerate(db, notesDeps([]), meetingId, "m1")).rejects.toBeInstanceOf(AlreadyConfirmedError);
  });
});

describe("meetingRequest (what the create-meeting route receives)", () => {
  it("reads a Notion link", () => {
    expect(meetingRequest({ url: "https://notion.so/x" })).toEqual({ kind: "url", url: "https://notion.so/x" });
  });
  it("reads a title for a meeting written in the site", () => {
    expect(meetingRequest({ title: "디자인 리뷰" })).toEqual({ kind: "notes", title: "디자인 리뷰" });
  });
  it("prefers the link when both are sent", () => {
    expect(meetingRequest({ url: "https://notion.so/x", title: "t" }).kind).toBe("url");
  });
  it("rejects anything else", () => {
    for (const body of [{}, null, undefined, "x", { url: 3 }, { title: 3 }, { url: "" }]) {
      expect(() => meetingRequest(body)).toThrow(ValidationError);
    }
  });
});

describe("meeting links", () => {
  it("adds http and https links, newest last", async () => {
    const { meetingId } = await createNotesMeeting(db, officeId, "m1", "회의");
    await addLink(db, meetingId, "m1", { title: "Figma 시안", url: "https://figma.com/file/abc" });
    await addLink(db, meetingId, "m1", { title: "", url: "http://example.com/doc" });
    const links = (await db.select().from(meetings).where(eq(meetings.id, meetingId)))[0].links;
    expect(links).toEqual([
      { title: "Figma 시안", url: "https://figma.com/file/abc" },
      { title: "example.com", url: "http://example.com/doc" },
    ]);
  });

  it("rejects javascript:, data: and malformed links", async () => {
    const { meetingId } = await createNotesMeeting(db, officeId, "m1", "회의");
    for (const url of ["javascript:alert(1)", "data:text/html,x", "not a url", ""]) {
      await expect(addLink(db, meetingId, "m1", { title: "x", url })).rejects.toBeInstanceOf(ValidationError);
    }
    expect((await db.select().from(meetings).where(eq(meetings.id, meetingId)))[0].links).toEqual([]);
  });

  it("refuses non-members and a 21st link", async () => {
    const { meetingId } = await createNotesMeeting(db, officeId, "m1", "회의");
    await expect(addLink(db, meetingId, "out", { title: "x", url: "https://a.com" })).rejects.toBeInstanceOf(ForbiddenError);
    for (let i = 0; i < 20; i++) await addLink(db, meetingId, "m1", { title: `l${i}`, url: `https://a.com/${i}` });
    await expect(addLink(db, meetingId, "m1", { title: "넘침", url: "https://a.com/x" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("activity from meetings", () => {
  it("writes feed items when a meeting is uploaded, started from notes, and confirmed", async () => {
    const { meetingId } = await registerMeeting(db, deps(), officeId, "m1", "https://notion.so/x");
    await createNotesMeeting(db, officeId, "m1", "메모 회의");
    await confirmMeeting(db, meetingId, "admin");
    const texts = (await recentActivity(db, officeId, "m1")).map((f) => f.text);
    expect(texts.some((t) => t.includes("회의록을 올렸어요") && t.includes("주간 회의"))).toBe(true);
    expect(texts.some((t) => t.includes("새 회의 기록") && t.includes("메모 회의"))).toBe(true);
    expect(texts.some((t) => t.includes("회의를 확정했어요") && t.includes("주간 회의"))).toBe(true);
  });
});

describe("roles on todos", () => {
  const roleDeps = (todos: { title: string; assigneeName: string | null; role?: string | null }[]): MeetingDeps => ({
    fetchText: async () => ({ pageId: "p", title: "역할 회의", text: "x" }),
    summarize: async () => ({ decisions: [], todos }),
  });

  it("stores the role the AI gave a todo", async () => {
    const { meetingId } = await registerMeeting(db, roleDeps([{ title: "시안", assigneeName: null, role: "디자인" }]), officeId, "m1", "u");
    expect((await todosOf(meetingId))[0].role).toBe("디자인");
  });

  it("fills in the assignee when exactly one member has the role, leaving it editable", async () => {
    await setRoles(db, officeId, "m1", "m1", ["개발"]);
    const { meetingId } = await registerMeeting(db, roleDeps([{ title: "API", assigneeName: null, role: "개발" }]), officeId, "admin", "u");
    expect((await todosOf(meetingId))[0].assigneeUserId).toBe("m1");
  });

  it("leaves the assignee empty when two members have the role", async () => {
    await setRoles(db, officeId, "m1", "m1", ["개발"]);
    await setRoles(db, officeId, "admin", "admin", ["개발"]);
    const { meetingId } = await registerMeeting(db, roleDeps([{ title: "API", assigneeName: null, role: "개발" }]), officeId, "admin", "u");
    expect((await todosOf(meetingId))[0].assigneeUserId).toBeNull();
  });

  it("keeps a named assignee over the role suggestion", async () => {
    await setRoles(db, officeId, "m1", "m1", ["개발"]);
    const { meetingId } = await registerMeeting(db, roleDeps([{ title: "API", assigneeName: "Admin", role: "개발" }]), officeId, "admin", "u");
    expect((await todosOf(meetingId))[0].assigneeUserId).toBe("admin");
  });

  it("drops a role that is too long instead of failing the whole meeting", async () => {
    const { meetingId } = await registerMeeting(db, roleDeps([{ title: "a", assigneeName: null, role: "가".repeat(30) }]), officeId, "m1", "u");
    expect((await todosOf(meetingId))[0].role).toBeNull();
  });

  it("lets editTodos set and clear a role, and rejects a bad one before deleting anything", async () => {
    const { meetingId } = await registerMeeting(db, roleDeps([{ title: "a", assigneeName: null }]), officeId, "m1", "u");
    await editTodos(db, meetingId, "m1", [{ title: "a", assigneeUserId: null, repo: "o/r", role: "개발" }]);
    expect((await todosOf(meetingId))[0].role).toBe("개발");
    await editTodos(db, meetingId, "m1", [{ title: "a", assigneeUserId: null, repo: "o/r" }]);
    expect((await todosOf(meetingId))[0].role).toBeNull();
    await expect(
      editTodos(db, meetingId, "m1", [{ title: "a", assigneeUserId: null, repo: "o/r", role: "가".repeat(13) }]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await todosOf(meetingId)).toHaveLength(1);
  });
});

describe("officeMembers roles and status", () => {
  it("returns each member's roles and status", async () => {
    await setRoles(db, officeId, "m1", "m1", ["개발"]);
    const m1 = (await officeMembers(db, officeId)).find((m) => m.userId === "m1")!;
    expect(m1.roles).toEqual(["개발"]);
    expect(m1.status).toBe("working");
  });
});

describe("makeDeps (personal notion token)", () => {
  it("throws NotConnectedError when the user has no Notion token", async () => {
    await saveSettings(db, officeId, "admin", { notionParentPageId: "parent" });
    const err = await makeDeps(db, officeId, "m1").catch((e) => e);
    expect(err).toBeInstanceOf(NotConnectedError);
    expect(err.provider).toBe("notion");
  });

  it("returns fetchText and summarize once the user saved a Notion token", async () => {
    await saveSettings(db, officeId, "admin", { notionParentPageId: "parent" });
    await saveConnection(db, "m1", "notion", "secret_x");
    const d = await makeDeps(db, officeId, "m1");
    expect(typeof d.fetchText).toBe("function");
    expect(typeof d.summarize).toBe("function");
  });

  it("reports a team that has no Notion parent page yet as a team setup problem, not a crash", async () => {
    await saveConnection(db, "m1", "notion", "secret_x");
    const err = await makeDeps(db, officeId, "m1").catch((e) => e);
    expect(err).toBeInstanceOf(TeamSetupError);
    expect(err.what).toBe("notion");
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

  it("regenerate does not overwrite a meeting confirmed while the AI was running", async () => {
    const { meetingId } = await registerMeeting(db, deps(), officeId, "m1", "u");
    const racing = deps({
      summarize: async () => {
        await confirmMeeting(db, meetingId, "admin"); // someone confirms mid-regenerate
        return { decisions: ["새 결정"], todos: [{ title: "덮어쓰기", assigneeName: null }] };
      },
    });
    await expect(regenerate(db, racing, meetingId, "m1")).rejects.toBeInstanceOf(AlreadyConfirmedError);
    const [m] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
    expect(m.summary.decisions).toEqual(["A로 간다"]);
    expect((await todosOf(meetingId)).map((t) => t.title).sort()).toEqual(["API", "디자인"]);
  });

  it("editTodos rejects a repo outside the office's list and keeps existing todos", async () => {
    const { meetingId } = await registerMeeting(db, deps(), officeId, "m1", "u");
    await expect(
      editTodos(db, meetingId, "m1", [{ title: "x", assigneeUserId: null, repo: "evil/other" }]),
    ).rejects.toThrow(/repo/);
    expect(await todosOf(meetingId)).toHaveLength(2);
  });

  it("editTodos rejects an assignee who is not an office member and keeps existing todos", async () => {
    const { meetingId } = await registerMeeting(db, deps(), officeId, "m1", "u");
    await expect(
      editTodos(db, meetingId, "m1", [{ title: "x", assigneeUserId: "out", repo: "o/r" }]),
    ).rejects.toThrow(/assignee/);
    expect(await todosOf(meetingId)).toHaveLength(2);
  });

  it("editTodos rejects malformed input before deleting anything", async () => {
    const { meetingId } = await registerMeeting(db, deps(), officeId, "m1", "u");
    await expect(editTodos(db, meetingId, "m1", "nope" as never)).rejects.toThrow();
    await expect(editTodos(db, meetingId, "m1", [{ assigneeUserId: null, repo: "o/r" } as never])).rejects.toThrow();
    expect(await todosOf(meetingId)).toHaveLength(2);
  });

  it("removing a member unassigns their todos so the rest can still be edited", async () => {
    const { meetingId } = await registerMeeting(db, deps(), officeId, "m1", "u");
    await removeMember(db, officeId, "admin", "m1");
    expect((await todosOf(meetingId)).every((t) => t.assigneeUserId === null)).toBe(true);
  });

  it("editTodos rejects non-members", async () => {
    const { meetingId } = await registerMeeting(db, deps(), officeId, "m1", "u");
    await expect(editTodos(db, meetingId, "out", [])).rejects.toThrow();
  });
});
