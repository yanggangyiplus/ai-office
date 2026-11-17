import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { meetings, offices } from "@/db/schema";
import { buildBoard } from "@/lib/board";
import { loadWork } from "@/lib/board-data";
import { recentChat } from "@/lib/chat";
import { officeMembers } from "@/lib/meetings";
import { isMember } from "@/lib/offices";
import { realtimeMode } from "@/lib/realtime/mode";
import { assignDesks } from "@/lib/space/desks";
import { TEAM_MAP, deskSpots, spawnPoint } from "@/lib/space/map";
import { TeamSpace } from "@/components/space/TeamSpace";

export const instant = false;

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  await connection(); // request-time render: auth() re-encrypts the session cookie with random bytes
  const { id } = await params;
  const s = await auth();
  if (!s) redirect("/");
  if (!(await isMember(db, id, s.user.id))) notFound();

  const [team] = await db.select().from(offices).where(eq(offices.id, id));
  const ms = await officeMembers(db, id);
  const desks = assignDesks(ms);
  const spots = deskSpots(TEAM_MAP);
  const myDesk = desks.get(s.user.id);
  const start = myDesk != null ? { ...spots[myDesk], dir: "down" as const } : spawnPoint(TEAM_MAP);

  const list = await db
    .select({ id: meetings.id, title: meetings.title, status: meetings.status })
    .from(meetings)
    .where(eq(meetings.officeId, id))
    .orderBy(desc(meetings.createdAt));
  const { items, note } = await loadWork(db, s.user.id, team.repos);
  const chat = await recentChat(db, id, s.user.id);

  return (
    <TeamSpace
      team={{ id, name: team.name, isAdmin: team.adminId === s.user.id }}
      me={{ id: s.user.id, name: s.user.name }}
      mode={realtimeMode(process.env)}
      start={start}
      deskOwners={ms.flatMap((m) => {
        const d = desks.get(m.userId);
        return d != null ? [{ name: m.name, desk: d }] : [];
      })}
      meetings={list}
      board={buildBoard(items, ms)}
      boardNote={note}
      initialChat={chat}
    />
  );
}
