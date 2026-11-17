import { desc, eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { meetings, offices, todos } from "@/db/schema";
import { recentActivity } from "@/lib/activity";
import { presenceOf } from "@/lib/attendance";
import { buildBoard } from "@/lib/board";
import { loadWork } from "@/lib/board-data";
import { recentChat } from "@/lib/chat";
import { officeMembers } from "@/lib/meetings";
import { isMember } from "@/lib/offices";
import { realtimeMode } from "@/lib/realtime/mode";
import { assignDesks } from "@/lib/space/desks";
import { TEAM_MAP, deskSpots, spawnPoint } from "@/lib/space/map";
import { TeamSpace } from "@/components/space/TeamSpace";
import type { MeetingView, MemberView } from "@/components/space/types";

export const instant = false;

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  await connection(); // request-time render: auth() re-encrypts the session cookie with random bytes
  const { id } = await params;
  const s = await auth();
  if (!s) redirect("/");
  if (!(await isMember(db, id, s.user.id))) notFound();

  const [team] = await db.select().from(offices).where(eq(offices.id, id));
  const ms = await officeMembers(db, id);
  const presence = await presenceOf(db, id);
  const desks = assignDesks(ms);
  const spots = deskSpots(TEAM_MAP);
  const myDesk = desks.get(s.user.id);
  const start = myDesk != null ? { ...spots[myDesk], dir: "down" as const } : spawnPoint(TEAM_MAP);

  const members: MemberView[] = ms.map((m) => ({
    userId: m.userId,
    name: m.name,
    roles: m.roles,
    present: presence.get(m.userId)?.present ?? false,
    status: m.status,
    desk: desks.get(m.userId) ?? null,
  }));

  const rows = await db.select().from(meetings).where(eq(meetings.officeId, id)).orderBy(desc(meetings.createdAt));
  const allTodos = rows.length ? await db.select().from(todos).where(inArray(todos.meetingId, rows.map((r) => r.id))) : [];
  const nameOf = new Map(ms.map((m) => [m.userId, m.name]));
  const meetingViews: MeetingView[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    fromNotion: !!r.notionPageId,
    notionUrl: r.notionPageId ? `https://www.notion.so/${r.notionPageId}` : null,
    notes: r.notes,
    links: r.links,
    decisions: r.summary.decisions,
    todos: allTodos
      .filter((t) => t.meetingId === r.id)
      .map((t) => ({ id: t.id, title: t.title, assigneeName: t.assigneeUserId ? (nameOf.get(t.assigneeUserId) ?? null) : null, role: t.role, issueUrl: t.issueUrl })),
    createdAt: r.createdAt.getTime(),
  }));

  const { items, note } = await loadWork(db, s.user.id, team.repos);

  return (
    <TeamSpace
      team={{ id, name: team.name, isAdmin: team.adminId === s.user.id }}
      me={{ id: s.user.id, name: s.user.name }}
      mode={realtimeMode(process.env)}
      start={start}
      members={members}
      meetings={meetingViews}
      board={buildBoard(items, ms)}
      boardNote={note}
      initialChat={await recentChat(db, id, s.user.id)}
      feed={await recentActivity(db, id, s.user.id)}
    />
  );
}
