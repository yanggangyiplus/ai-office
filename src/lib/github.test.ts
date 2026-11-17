import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/db/testdb";
import { offices, todos } from "@/db/schema";
import { recentActivity } from "./activity";
import type { Db } from "@/db";
import { GithubPermissionError, createIssuesForTodos, fetchWork, makeGithub, type GithubLike } from "./github";
import { NotConnectedError, saveConnection } from "./connections";
import { createInvite, createOffice, joinByInvite, upsertUser } from "./offices";
import { confirmMeeting, registerMeeting } from "./meetings";

let db: Db;
let meetingId: string;
let created: { owner: string; repo: string; title: string; assignees?: string[] }[];

const gh = (over: Partial<GithubLike> = {}): GithubLike =>
  ({
    issues: {
      create: async (a: (typeof created)[number]) => {
        created.push(a);
        return { data: { html_url: `https://github.com/${a.owner}/${a.repo}/issues/${created.length}` } };
      },
      listForRepo: async () => ({ data: [] }),
    },
    pulls: { list: async () => ({ data: [] }) },
    ...over,
  }) as unknown as GithubLike;

beforeEach(async () => {
  created = [];
  db = await makeTestDb();
  await upsertUser(db, { id: "admin", email: "a@x.c", name: "Admin" });
  await upsertUser(db, { id: "m1", email: "m@x.c", name: "민수" });
  const officeId = (await createOffice(db, "admin", "팀")).id;
  await joinByInvite(db, await createInvite(db, officeId), "m1", "minsu");
  const deps = {
    fetchText: async () => ({ pageId: "p", title: "t", text: "x" }),
    summarize: async () => ({ decisions: [], todos: [{ title: "API", assigneeName: "민수" }] }),
  };
  meetingId = (await registerMeeting(db, deps, officeId, "admin", "u")).meetingId;
  await db.update(todos).set({ repo: "o/r" }).where(eq(todos.meetingId, meetingId));
});

const todoIds = async () => (await db.select().from(todos)).map((t) => t.id);

describe("createIssuesForTodos", () => {
  it("refuses todos of a draft meeting", async () => {
    await expect(createIssuesForTodos(db, gh(), meetingId, await todoIds())).rejects.toThrow();
    expect(created).toHaveLength(0);
  });

  it("creates one issue per todo with the assignee's github username", async () => {
    await confirmMeeting(db, meetingId, "admin");
    const r = await createIssuesForTodos(db, gh(), meetingId, await todoIds());
    expect(created).toEqual([expect.objectContaining({ owner: "o", repo: "r", title: "API", assignees: ["minsu"] })]);
    expect(r[0].url).toContain("o/r/issues/1");
  });

  it("does not create a second issue when called twice", async () => {
    await confirmMeeting(db, meetingId, "admin");
    const ids = await todoIds();
    await createIssuesForTodos(db, gh(), meetingId, ids);
    await createIssuesForTodos(db, gh(), meetingId, ids);
    expect(created).toHaveLength(1);
  });
});

describe("personal github token", () => {
  it("makeGithub throws NotConnectedError when the user has no github token", async () => {
    const err = await makeGithub(db, "m1").catch((e) => e);
    expect(err).toBeInstanceOf(NotConnectedError);
    expect(err.provider).toBe("github");
  });

  it("makeGithub returns a client once the user saved a token", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    await saveConnection(db, "m1", "github", "ghp_x");
    const client = await makeGithub(db, "m1");
    expect(typeof client.issues.create).toBe("function");
  });

  it("turns a 403 from GitHub into GithubPermissionError and releases the claim", async () => {
    await confirmMeeting(db, meetingId, "admin");
    const denied = gh({
      issues: { create: async () => { throw Object.assign(new Error("forbidden"), { status: 403 }); }, listForRepo: async () => ({ data: [] }) },
    } as unknown as Partial<GithubLike>);
    const err = await createIssuesForTodos(db, denied, meetingId, await todoIds()).catch((e) => e);
    expect(err).toBeInstanceOf(GithubPermissionError);
    expect(err.repo).toBe("o/r");
    expect((await db.select().from(todos))[0].issueUrl).toBeNull();
  });

  it("also treats a 404 (repo not visible to this token) as a permission problem", async () => {
    await confirmMeeting(db, meetingId, "admin");
    const hidden = gh({
      issues: { create: async () => { throw Object.assign(new Error("not found"), { status: 404 }); }, listForRepo: async () => ({ data: [] }) },
    } as unknown as Partial<GithubLike>);
    await expect(createIssuesForTodos(db, hidden, meetingId, await todoIds())).rejects.toBeInstanceOf(GithubPermissionError);
  });
});

describe("issue creation in the activity feed", () => {
  it("logs how many issues the person created, and nothing when none were created", async () => {
    await confirmMeeting(db, meetingId, "admin");
    const ids = await todoIds();
    await createIssuesForTodos(db, gh(), meetingId, ids, "admin");
    await createIssuesForTodos(db, gh(), meetingId, ids, "admin"); // already created: nothing new
    const [office] = await db.select().from(offices);
    const feed = (await recentActivity(db, office.id, "admin")).map((f) => f.text).filter((t) => t.includes("이슈"));
    expect(feed).toEqual(["이슈 1개를 만들었어요"]);
  });
});

describe("createIssuesForTodos concurrency", () => {
  it("creates one issue when two requests race", async () => {
    await confirmMeeting(db, meetingId, "admin");
    const ids = await todoIds();
    const slow = gh({
      issues: {
        create: async (a: (typeof created)[number]) => {
          created.push(a);
          await new Promise((r) => setTimeout(r, 20));
          return { data: { html_url: "https://github.com/o/r/issues/1" } };
        },
        listForRepo: async () => ({ data: [] }),
      },
    } as unknown as Partial<GithubLike>);
    await Promise.all([createIssuesForTodos(db, slow, meetingId, ids), createIssuesForTodos(db, slow, meetingId, ids)]);
    expect(created).toHaveLength(1);
  });

  it("releases the claim when GitHub fails so a retry can create the issue", async () => {
    await confirmMeeting(db, meetingId, "admin");
    const ids = await todoIds();
    const failing = gh({
      issues: { create: async () => { throw new Error("github down"); }, listForRepo: async () => ({ data: [] }) },
    } as unknown as Partial<GithubLike>);
    await expect(createIssuesForTodos(db, failing, meetingId, ids)).rejects.toThrow("github down");
    await createIssuesForTodos(db, gh(), meetingId, ids);
    expect(created).toHaveLength(1);
  });

  it("refuses a todo with no repo set", async () => {
    await confirmMeeting(db, meetingId, "admin");
    await db.update(todos).set({ repo: "" }).where(eq(todos.meetingId, meetingId));
    await expect(createIssuesForTodos(db, gh(), meetingId, await todoIds())).rejects.toThrow(/repo/);
    expect(created).toHaveLength(0);
  });
});

describe("fetchWork", () => {
  it("marks issues with a linked open PR and drops PRs from the issue list", async () => {
    const client = gh({
      issues: {
        create: async () => ({ data: { html_url: "" } }),
        listForRepo: async () => ({
          data: [
            { number: 1, title: "A", state: "open", assignee: { login: "minsu" } },
            { number: 2, title: "B", state: "open", assignee: null },
            { number: 3, title: "PR itself", state: "open", assignee: null, pull_request: {} },
            { number: 4, title: "C", state: "closed", assignee: { login: "minsu" } },
          ],
        }),
      },
      pulls: { list: async () => ({ data: [{ number: 3, body: "Closes #1" }] }) },
    } as unknown as Partial<GithubLike>);
    const w = await fetchWork(client, ["o/r"]);
    expect(w.map((x) => x.number)).toEqual([1, 2, 4]);
    expect(w.find((x) => x.number === 1)).toMatchObject({ hasOpenPr: true, assignee: "minsu", repo: "o/r", state: "open" });
    expect(w.find((x) => x.number === 2)!.hasOpenPr).toBe(false);
    expect(w.find((x) => x.number === 4)!.state).toBe("closed");
  });
});
