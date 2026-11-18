import { desc, eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "@/db";
import { activity, attendance, connections, meetings, members, messages, offices, todos, users } from "@/db/schema";

type Env = Record<string, string | undefined>;

// The site's operators: a comma-separated list of sign-in emails in ADMIN_EMAILS. Nothing configured means nobody.
export function isAdminEmail(email: string | null | undefined, env: Env): boolean {
  const mail = email?.trim().toLowerCase();
  if (!mail) return false;
  return (env.ADMIN_EMAILS ?? "").split(",").some((a) => a.trim().toLowerCase() === mail);
}

export type Check = { key: string; label: string; ok: boolean; note: string };

// Which settings are present. Only yes/no is reported, never a value.
export function systemChecks(env: Env): Check[] {
  const has = (k: string) => !!env[k]?.trim();
  const prod = env.NODE_ENV === "production";
  const c = (key: string, label: string, ok: boolean, note: string): Check => ({ key, label, ok, note });
  return [
    c("AUTH_SECRET", "로그인 암호키", has("AUTH_SECRET"), "없으면 로그인이 동작하지 않아요"),
    c("google", "구글 로그인", has("AUTH_GOOGLE_ID") && has("AUTH_GOOGLE_SECRET"), "AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET"),
    c("TOKEN_ENCRYPTION_KEY", "토큰 암호화 키", has("TOKEN_ENCRYPTION_KEY"), "없으면 GitHub·Notion 연결을 저장할 수 없어요"),
    c("DATABASE_URL", "데이터베이스 주소", has("DATABASE_URL") || has("POSTGRES_URL"), "DATABASE_URL 또는 POSTGRES_URL"),
    c("ABLY_API_KEY", "실시간 걷기·채팅 (Ably)", has("ABLY_API_KEY"), prod ? "없으면 팀 공간에 '설정 안 됨'이 떠요" : "개발 중에는 같은 브라우저 탭끼리 동작해요"),
    c("ANTHROPIC_API_KEY", "AI 회의 정리 (Anthropic)", has("ANTHROPIC_API_KEY"), "없으면 'AI로 정리하기'가 실패해요"),
    // ok means "safe": the dev-only test login must be off in production
    c("AUTH_TEST_LOGIN", "테스트 로그인 꺼짐", !(prod && has("AUTH_TEST_LOGIN")), "운영에서 켜져 있으면 안 돼요"),
    c("ADMIN_EMAILS", "관리자 지정", has("ADMIN_EMAILS"), "이 페이지를 볼 수 있는 이메일 목록"),
  ];
}

const count = async (db: Db, table: PgTable) => Number((await db.select({ n: sql<number>`count(*)` }).from(table))[0].n);

export async function adminOverview(db: Db) {
  const totals = {
    users: await count(db, users),
    teams: await count(db, offices),
    meetings: await count(db, meetings),
    todos: await count(db, todos),
    messages: await count(db, messages),
    atWork: Number((await db.select({ n: sql<number>`count(*)` }).from(attendance).where(sql`${attendance.checkedOutAt} is null`))[0].n),
  };

  const [userRows, teamCount, linked, teamRows, meetingCount, todoCount, lastSeen, adminNames, recentRows] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).orderBy(users.name),
    db.select({ userId: members.userId, n: sql<number>`count(*)` }).from(members).groupBy(members.userId),
    db.select({ userId: connections.userId, provider: connections.provider }).from(connections), // provider only, never the token
    db.select({ id: offices.id, name: offices.name, adminId: offices.adminId }).from(offices).orderBy(offices.name),
    db.select({ officeId: meetings.officeId, n: sql<number>`count(*)` }).from(meetings).groupBy(meetings.officeId),
    db
      .select({ officeId: meetings.officeId, n: sql<number>`count(*)` })
      .from(todos)
      .innerJoin(meetings, eq(meetings.id, todos.meetingId))
      .groupBy(meetings.officeId),
    db.select({ officeId: activity.officeId, at: sql<Date>`max(${activity.createdAt})` }).from(activity).groupBy(activity.officeId),
    db.select({ id: users.id, name: users.name }).from(users),
    db
      .select({ teamName: offices.name, userName: users.name, text: activity.text, at: activity.createdAt })
      .from(activity)
      .innerJoin(offices, eq(offices.id, activity.officeId))
      .innerJoin(users, eq(users.id, activity.userId))
      .orderBy(desc(activity.seq))
      .limit(30),
  ]);
  const memberCount = await db.select({ officeId: members.officeId, n: sql<number>`count(*)` }).from(members).groupBy(members.officeId);

  const by = <T extends { n: number }>(rows: (T & { officeId?: string; userId?: string })[], key: "officeId" | "userId") =>
    new Map(rows.map((r) => [r[key]!, Number(r.n)]));
  const teamsOf = by(teamCount, "userId");
  const membersOf = by(memberCount, "officeId");
  const meetingsOf = by(meetingCount, "officeId");
  const todosOf = by(todoCount, "officeId");
  const lastOf = new Map(lastSeen.map((r) => [r.officeId, r.at ? new Date(r.at).getTime() : null]));
  const nameOf = new Map(adminNames.map((u) => [u.id, u.name]));
  const has = (id: string, p: "github" | "notion") => linked.some((l) => l.userId === id && l.provider === p);

  return {
    totals,
    users: userRows.map((u) => ({ ...u, teams: teamsOf.get(u.id) ?? 0, github: has(u.id, "github"), notion: has(u.id, "notion") })),
    teams: teamRows.map((t) => ({
      id: t.id,
      name: t.name,
      adminName: nameOf.get(t.adminId) ?? "?",
      members: membersOf.get(t.id) ?? 0,
      meetings: meetingsOf.get(t.id) ?? 0,
      todos: todosOf.get(t.id) ?? 0,
      lastActivityAt: lastOf.get(t.id) ?? null,
    })),
    recent: recentRows.map((r) => ({ teamName: r.teamName, userName: r.userName, text: r.text, at: r.at.getTime() })),
  };
}
