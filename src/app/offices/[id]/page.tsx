import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { meetings, offices } from "@/db/schema";
import { buildBoard } from "@/lib/board";
import { loadWork } from "@/lib/board-data";
import { officeMembers } from "@/lib/meetings";
import { isMember } from "@/lib/offices";
import { makeInvite } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { MeetingLinkForm } from "@/components/Forms";
import { PostButton } from "@/components/PostButton";

export const instant = false;

const COLS = [
  { key: "doing", label: "하는 중", color: "var(--doing)" },
  { key: "next", label: "다음", color: "var(--next)" },
  { key: "done", label: "끝남", color: "var(--done)" },
] as const;

export default async function OfficeHome({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  await connection(); // request-time render: auth() re-encrypts the session cookie with random bytes
  const { id } = await params;
  const { invite } = await searchParams;
  const s = await auth();
  if (!s) redirect("/");
  if (!(await isMember(db, id, s.user.id))) notFound();

  const [office] = await db.select().from(offices).where(eq(offices.id, id));
  const isAdmin = office.adminId === s.user.id;
  const ms = await officeMembers(db, id);
  const list = await db.select().from(meetings).where(eq(meetings.officeId, id)).orderBy(desc(meetings.createdAt));

  const { items, note: boardError } = await loadWork(db, s.user.id, office.repos);
  const board = buildBoard(items, ms);

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <header className="mb-4 flex items-center justify-between text-white">
        <h1 className="text-2xl font-bold">{office.name}</h1>
        <nav className="flex gap-3 text-sm">
          <Link href="/offices" className="underline">내 오피스</Link>
          {isAdmin && <Link href={`/offices/${id}/settings`} className="underline">설정</Link>}
        </nav>
      </header>

      <div className="floor grid gap-6 border-4 border-black p-6 md:grid-cols-[18rem_1fr]">
        {/* 회의실 */}
        <section className="px flex flex-col gap-3 p-4">
          <h2 className="font-bold">회의실</h2>
          <MeetingLinkForm officeId={id} />
          <ul className="flex flex-col gap-2 text-sm">
            {list.length === 0 && <li>아직 올라온 회의가 없어요.</li>}
            {list.map((m) => (
              <li key={m.id}>
                <Link className="underline" href={`/offices/${id}/meetings/${m.id}`}>{m.title}</Link>{" "}
                <span className="border-2 border-black px-1 text-xs" style={{ background: m.status === "confirmed" ? "var(--done)" : "var(--doing)" }}>
                  {m.status === "confirmed" ? "확정" : "초안"}
                </span>
              </li>
            ))}
          </ul>
          {isAdmin && (
            <form action={makeInvite} className="mt-2 border-t-4 border-black pt-3">
              <input type="hidden" name="officeId" value={id} />
              <button className="px-btn">초대 링크 만들기</button>
              {invite && <p className="mt-2 break-all text-xs">/join/{invite}</p>}
            </form>
          )}
        </section>

        {/* 책상 */}
        <section>
          {boardError && <p className="px mb-4 p-3 text-sm">{boardError}</p>}
          <div className="grid gap-5 sm:grid-cols-2">
            {board.map((row) => (
              <div key={row.member.userId} className="px p-3">
                <div className="mb-2 flex items-center gap-3">
                  <Avatar id={row.member.userId} />
                  <strong>{row.member.name}</strong>
                  {isAdmin && row.member.userId !== s.user.id && (
                    <span className="ml-auto text-xs">
                      <PostButton url={`/api/offices/${id}/members/remove`} body={{ userId: row.member.userId }}>내보내기</PostButton>
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2 text-sm">
                  {COLS.map((c) => (
                    <div key={c.key}>
                      <span className="border-2 border-black px-1 text-xs font-bold" style={{ background: c.color }}>
                        {c.label} {row[c.key].length}
                      </span>
                      <ul className="mt-1 list-inside list-disc">
                        {row[c.key].slice(0, 4).map((i) => (
                          <li key={`${i.repo}#${i.number}`}>{i.title}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
