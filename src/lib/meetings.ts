import { Client } from "@notionhq/client";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { meetings, members, offices, todos, users } from "@/db/schema";
import { logActivity } from "./activity";
import { requireToken } from "./connections";
import { TeamSetupError, ValidationError } from "./errors";
import { fetchMeetingText, type NotionLike } from "./notion";
import { isMember, ForbiddenError } from "./offices";
import { anthropicLlm, matchAssignee, summarizeMeeting, type Summary } from "./summarize";

export class AlreadyConfirmedError extends Error {}
export { ValidationError }; // re-exported for existing importers

export type MeetingDeps = {
  fetchText(url: string): Promise<{ pageId: string; title: string; text: string }>;
  summarize(text: string): Promise<Summary>;
};

export type TodoInput = {
  id?: string;
  title: string;
  assigneeUserId: string | null;
  repo: string;
  description?: string;
};

// Reads with the acting user's own Notion token; the team only supplies the '회의록' parent page.
export async function makeDeps(db: Db, officeId: string, userId: string): Promise<MeetingDeps> {
  const [o] = await db.select().from(offices).where(eq(offices.id, officeId));
  if (!o?.notionParentPageId) throw new TeamSetupError("notion");
  const client = new Client({ auth: await requireToken(db, userId, "notion") }) as unknown as NotionLike;
  return {
    fetchText: (url) => fetchMeetingText(client, o.notionParentPageId!, url),
    summarize: (text) => summarizeMeeting(anthropicLlm, text),
  };
}

export async function officeMembers(db: Db, officeId: string) {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      githubUsername: users.githubUsername,
      joinedAt: members.joinedAt,
      roles: members.roles,
      status: members.status,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.officeId, officeId));
  return rows.map((r) => ({ ...r, githubUsername: r.githubUsername ?? "" }));
}

async function buildTodos(db: Db, officeId: string, meetingId: string, s: Summary) {
  const [o] = await db.select({ defaultRepo: offices.defaultRepo }).from(offices).where(eq(offices.id, officeId));
  const ms = await officeMembers(db, officeId);
  if (!s.todos.length) return;
  await db.insert(todos).values(
    s.todos.map((t) => ({
      meetingId,
      title: t.title,
      description: t.description,
      assigneeUserId: matchAssignee(t.assigneeName, ms),
      repo: o?.defaultRepo ?? "",
    })),
  );
}

async function loadForMember(db: Db, meetingId: string, userId: string) {
  const [m] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!m || !(await isMember(db, m.officeId, userId))) throw new ForbiddenError("members only");
  return m;
}

export async function registerMeeting(
  db: Db,
  deps: MeetingDeps,
  officeId: string,
  userId: string,
  url: string,
): Promise<{ meetingId: string }> {
  if (!(await isMember(db, officeId, userId))) throw new ForbiddenError("members only");
  const page = await deps.fetchText(url); // throws before anything is stored
  const summary = await deps.summarize(page.text);
  const [m] = await db
    .insert(meetings)
    .values({
      officeId,
      notionPageId: page.pageId,
      title: page.title,
      summary: { decisions: summary.decisions },
      createdBy: userId,
    })
    .returning({ id: meetings.id });
  await buildTodos(db, officeId, m.id, summary);
  await logActivity(db, officeId, userId, `회의록을 올렸어요 · ${page.title}`);
  return { meetingId: m.id };
}

export const MAX_TITLE_CHARS = 100;
export const MAX_NOTES_CHARS = 20_000;
export const MAX_LINKS = 20;

// A meeting written in the site: no Notion page, the notes are typed in and summarized later.
export async function createNotesMeeting(db: Db, officeId: string, userId: string, title: string): Promise<{ meetingId: string }> {
  if (!(await isMember(db, officeId, userId))) throw new ForbiddenError("members only");
  const t = typeof title === "string" ? title.trim() : "";
  if (!t) throw new ValidationError("title is empty");
  if (t.length > MAX_TITLE_CHARS) throw new ValidationError(`title is longer than ${MAX_TITLE_CHARS} characters`);
  const [m] = await db
    .insert(meetings)
    .values({ officeId, title: t, summary: { decisions: [] }, createdBy: userId })
    .returning({ id: meetings.id });
  await logActivity(db, officeId, userId, `새 회의 기록을 시작했어요 · ${t}`);
  return { meetingId: m.id };
}

export async function saveNotes(db: Db, meetingId: string, userId: string, notes: string): Promise<void> {
  const m = await loadForMember(db, meetingId, userId);
  if (m.status === "confirmed") throw new AlreadyConfirmedError();
  if (typeof notes !== "string") throw new ValidationError("notes must be text");
  if (notes.length > MAX_NOTES_CHARS) throw new ValidationError(`notes are longer than ${MAX_NOTES_CHARS} characters`);
  await db.update(meetings).set({ notes }).where(eq(meetings.id, meetingId));
}

// Only web links; javascript: and data: links would run in the viewer's browser.
export async function addLink(db: Db, meetingId: string, userId: string, link: { title: string; url: string }): Promise<void> {
  const m = await loadForMember(db, meetingId, userId);
  let url: URL;
  try {
    url = new URL(String(link?.url ?? ""));
  } catch {
    throw new ValidationError("link is not a valid address");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ValidationError("only http and https links are allowed");
  if (m.links.length >= MAX_LINKS) throw new ValidationError(`at most ${MAX_LINKS} links`);
  const title = (typeof link.title === "string" ? link.title.trim() : "") || url.host;
  await db.update(meetings).set({ links: [...m.links, { title: title.slice(0, 100), url: url.toString() }] }).where(eq(meetings.id, meetingId));
}

export async function regenerate(db: Db, deps: MeetingDeps, meetingId: string, userId: string): Promise<void> {
  const m = await loadForMember(db, meetingId, userId);
  if (m.status === "confirmed") throw new AlreadyConfirmedError();
  let text: string;
  if (m.notionPageId) {
    text = (await deps.fetchText(`https://www.notion.so/${m.notionPageId}`)).text;
  } else {
    text = m.notes.trim();
    if (!text) throw new ValidationError("write some notes first");
  }
  const summary = await deps.summarize(text);
  // The AI call took seconds; only write if the meeting is still a draft right now.
  const updated = await db
    .update(meetings)
    .set({ summary: { decisions: summary.decisions } })
    .where(and(eq(meetings.id, meetingId), eq(meetings.status, "draft")))
    .returning({ id: meetings.id });
  if (!updated.length) throw new AlreadyConfirmedError();
  await db.delete(todos).where(and(eq(todos.meetingId, meetingId), isNull(todos.issueUrl)));
  await buildTodos(db, m.officeId, meetingId, summary);
}

export async function editTodos(db: Db, meetingId: string, userId: string, input: TodoInput[]): Promise<void> {
  const m = await loadForMember(db, meetingId, userId);
  if (!Array.isArray(input)) throw new ValidationError("todos must be an array");
  const [o] = await db.select({ repos: offices.repos }).from(offices).where(eq(offices.id, m.officeId));
  const memberIds = new Set((await officeMembers(db, m.officeId)).map((x) => x.userId));
  for (const t of input) {
    if (typeof t?.title !== "string" || !t.title.trim()) throw new ValidationError("todo title required");
    if (typeof t.repo !== "string" || (t.repo !== "" && !o.repos.includes(t.repo))) throw new ValidationError("repo is not in the office's repo list");
    if (t.assigneeUserId !== null && !memberIds.has(t.assigneeUserId)) throw new ValidationError("assignee is not an office member");
  }
  // Todos that already became GitHub issues stay; everything else is replaced.
  await db.delete(todos).where(and(eq(todos.meetingId, meetingId), isNull(todos.issueUrl)));
  if (!input.length) return;
  await db.insert(todos).values(
    input.map((t) => ({
      meetingId,
      title: t.title,
      assigneeUserId: t.assigneeUserId,
      repo: t.repo,
      description: t.description,
    })),
  );
}

export async function confirmMeeting(db: Db, meetingId: string, userId: string): Promise<void> {
  const m = await loadForMember(db, meetingId, userId);
  if (m.status === "confirmed") throw new AlreadyConfirmedError();
  await db.update(meetings).set({ status: "confirmed" }).where(eq(meetings.id, meetingId));
  await logActivity(db, m.officeId, userId, `회의를 확정했어요 · ${m.title}`);
}
