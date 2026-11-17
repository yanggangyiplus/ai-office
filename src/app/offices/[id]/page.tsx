import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { meetings, offices } from "@/db/schema";
import { buildBoard } from "@/lib/board";
import { fetchWork, makeGithub, type WorkItem } from "@/lib/github";
import { officeMembers } from "@/lib/meetings";
import { createInvite, isMember } from "@/lib/offices";
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
  const { id } = await params;
  const { invite } = await searchParams;
  const s = await auth();
  if (!s) redirect("/");
  if (!(await isMember(db, id, s.user.id))) notFound();

  const [office] = await db.select().from(offices).where(eq(offices.id, id));
  const isAdmin = office.adminId === s.user.id;
  const ms = await officeMembers(db, id);
  const list = await db.select().from(meetings).where(eq(meetings.officeId, id)).orderBy(desc(meetings.createdAt));

  let items: WorkItem[] = [];
  let boardError = "";
  if (office.githubToken && office.repos.length) {
    try {
      items = await fetchWork(await makeGithub(db, id), office.repos);
    } catch {
      boardError = "GitHub에서 현황을 불러오지 못했습니다. 토큰과 저장소 이름을 확인하세요.";
    }
  } else {
    boardError = isAdmin ? "설정에서 GitHub 토큰과 저장소를 등록하면 현황판이 채워집니다." : "관리자가 GitHub를 연결하면 현황판이 채워집니다.";
  }
  const board = buildBoard(items, ms);

  async function makeInvite() {
    "use server";
    const code = await createInvite(db, id);
    redirect(`/offices/${id}?invite=${code}`);
  }

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
