import { Octokit } from "@octokit/rest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { meetings, offices, todos, users } from "@/db/schema";
import { requireToken } from "./connections";

// The Octokit calls we use, so tests can pass a fake.
export type GithubLike = {
  issues: {
    create(a: { owner: string; repo: string; title: string; body?: string; assignees?: string[] }): Promise<{
      data: { html_url: string };
    }>;
    listForRepo(a: { owner: string; repo: string; state: "all"; per_page: number }): Promise<{
      data: {
        number: number;
        title: string;
        state: string;
        assignee?: { login: string } | null;
        pull_request?: unknown;
      }[];
    }>;
  };
  pulls: {
    list(a: { owner: string; repo: string; state: "open"; per_page: number }): Promise<{
      data: { number: number; body?: string | null }[];
    }>;
  };
};

export type WorkItem = {
  repo: string;
  number: number;
  title: string;
  assignee: string | null;
  state: "open" | "closed";
  hasOpenPr: boolean;
};

// Uses the acting user's own GitHub token (issues are created as them).
export async function makeGithub(db: Db, userId: string): Promise<GithubLike> {
  return new Octokit({ auth: await requireToken(db, userId, "github") }) as unknown as GithubLike;
}

// GitHub says 403/404 when this token cannot write to (or even see) the repo.
export class GithubPermissionError extends Error {
  constructor(public repo: string) {
    super(`no permission on ${repo}`);
  }
}

const split = (repo: string) => {
  const [owner, name] = repo.split("/");
  return { owner, repo: name };
};

export async function createIssuesForTodos(
  db: Db,
  gh: GithubLike,
  meetingId: string,
  todoIds: string[],
): Promise<{ todoId: string; url: string }[]> {
  const [m] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!m || m.status !== "confirmed") throw new Error("meeting is not confirmed");
  const rows = await db
    .select({ todo: todos, github: users.githubUsername })
    .from(todos)
    .leftJoin(users, eq(users.id, todos.assigneeUserId))
    .where(and(eq(todos.meetingId, meetingId), inArray(todos.id, todoIds)));

  const open = rows.filter((r) => !r.todo.issueUrl);
  const noRepo = open.find((r) => !r.todo.repo);
  if (noRepo) throw new Error(`repo not set for todo "${noRepo.todo.title}"`);

  const out: { todoId: string; url: string }[] = [];
  for (const { todo, github } of open) {
    // Claim atomically so two concurrent requests cannot both create the issue.
    const claimed = await db
      .update(todos)
      .set({ issueUrl: "pending" })
      .where(and(eq(todos.id, todo.id), isNull(todos.issueUrl)))
      .returning({ id: todos.id });
    if (!claimed.length) continue;
    try {
      const res = await gh.issues.create({
        ...split(todo.repo),
        title: todo.title,
        body: todo.description ?? undefined,
        assignees: github ? [github] : undefined,
      });
      await db.update(todos).set({ issueUrl: res.data.html_url }).where(eq(todos.id, todo.id));
      out.push({ todoId: todo.id, url: res.data.html_url });
    } catch (e) {
      await db.update(todos).set({ issueUrl: null }).where(eq(todos.id, todo.id));
      const status = (e as { status?: number }).status;
      if (status === 403 || status === 404) throw new GithubPermissionError(todo.repo);
      throw e;
    }
  }
  return out;
}

export async function fetchWork(gh: GithubLike, repos: string[]): Promise<WorkItem[]> {
  const all: WorkItem[] = [];
  for (const repo of repos) {
    const [issues, prs] = await Promise.all([
      gh.issues.listForRepo({ ...split(repo), state: "all", per_page: 100 }),
      gh.pulls.list({ ...split(repo), state: "open", per_page: 100 }),
    ]);
    const linked = new Set<number>();
    for (const pr of prs.data) for (const m of (pr.body ?? "").matchAll(/#(\d+)/g)) linked.add(Number(m[1]));
    for (const i of issues.data) {
      if (i.pull_request) continue;
      all.push({
        repo,
        number: i.number,
        title: i.title,
        assignee: i.assignee?.login ?? null,
        state: i.state === "closed" ? "closed" : "open",
        hasOpenPr: linked.has(i.number),
      });
    }
  }
  return all;
}
