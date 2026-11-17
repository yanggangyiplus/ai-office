import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { meetings, offices, todos } from "@/db/schema";
import { officeMembers } from "@/lib/meetings";
import { isMember } from "@/lib/offices";
import { TodoEditor } from "@/components/Forms";

export const instant = false;

export default async function MeetingPage({ params }: { params: Promise<{ id: string; meetingId: string }> }) {
  await connection(); // request-time render: auth() re-encrypts the session cookie with random bytes
  const { id, meetingId } = await params;
  const s = await auth();
  if (!s) redirect("/");
  if (!(await isMember(db, id, s.user.id))) notFound();

  const [m] = await db.select().from(meetings).where(and(eq(meetings.id, meetingId), eq(meetings.officeId, id)));
  if (!m) notFound();
  const [office] = await db.select({ repos: offices.repos }).from(offices).where(eq(offices.id, id));
  const rows = await db.select().from(todos).where(eq(todos.meetingId, meetingId));
  const ms = await officeMembers(db, id);
  const confirmed = m.status === "confirmed";

  return (
    <main className="floor mx-auto my-8 flex w-full max-w-3xl flex-col gap-6 border border-[var(--line)] p-6">
      <Link href={`/offices/${id}`} className="underline">← 오피스로</Link>
      <h1 className="text-2xl font-bold">
        {m.title} <span className="text-base">({confirmed ? "확정" : "초안 — 확인 후 확정하세요"})</span>
      </h1>

      <section className="px p-4">
        <h2 className="mb-2 font-bold">결정 사항</h2>
        <ul className="list-inside list-disc">
          {m.summary.decisions.length === 0 && <li>없음</li>}
          {m.summary.decisions.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-bold">할 일</h2>
        <TodoEditor
          key={rows.map((r) => r.id).join()}
          meetingId={meetingId}
          confirmed={confirmed}
          initial={rows}
          members={ms.map((x) => ({ userId: x.userId, name: x.name }))}
          repos={office.repos}
        />
      </section>

    </main>
  );
}
