import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { adminOverview, isAdminEmail, systemChecks } from "@/lib/admin";
import { realtimeMode } from "@/lib/realtime/mode";

export const instant = false;

const when = (at: number | null) =>
  at ? new Date(at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
const card = "px p-4";
const h2 = "mb-2 text-xs font-semibold tracking-wide text-[var(--sub)]";

// Site operators only. Anyone else gets a plain 404, so the page does not even show that it exists.
export default async function AdminPage() {
  await connection(); // request-time render: auth() re-encrypts the session cookie with random bytes
  const s = await auth();
  if (!s) redirect("/");
  if (!isAdminEmail(s.user.email, process.env)) notFound();

  const o = await adminOverview(db);
  const checks = systemChecks(process.env);
  const bad = checks.filter((c) => !c.ok).length;
  const stat = (label: string, value: number) => (
    <span className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--sub)]">
      {label} <b className="ml-1 tabular-nums text-[var(--ink)]">{value}</b>
    </span>
  );

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-10">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] py-3">
        <h1 className="text-base font-bold">관리자 · 개발자 모드</h1>
        <span className="chip">실시간 {realtimeMode(process.env)}</span>
        <span className="flex-1" />
        <Link className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-sm text-[var(--sub)]" href="/me">내 공간</Link>
      </header>

      <section className="flex flex-wrap items-center gap-2 py-3" aria-label="전체 숫자">
        {stat("사용자", o.totals.users)}
        {stat("팀", o.totals.teams)}
        {stat("회의", o.totals.meetings)}
        {stat("할 일", o.totals.todos)}
        {stat("채팅", o.totals.messages)}
        {stat("지금 출근", o.totals.atWork)}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className={card} aria-label="팀">
            <h2 className={h2}>팀 · {o.teams.length}</h2>
            {o.teams.length === 0 && <p className="text-sm text-[var(--sub)]">아직 팀이 없어요.</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--sub)]">
                  <tr><th className="py-1 pr-3">이름</th><th className="pr-3">관리자</th><th className="pr-3">팀원</th><th className="pr-3">회의</th><th className="pr-3">할 일</th><th>마지막 활동</th></tr>
                </thead>
                <tbody>
                  {o.teams.map((t) => (
                    <tr key={t.id} className="border-t border-[var(--line)]">
                      <td className="py-1.5 pr-3 font-semibold"><Link className="hover:underline" href={`/teams/${t.id}`}>{t.name}</Link></td>
                      <td className="pr-3">{t.adminName}</td>
                      <td className="pr-3 tabular-nums">{t.members}</td>
                      <td className="pr-3 tabular-nums">{t.meetings}</td>
                      <td className="pr-3 tabular-nums">{t.todos}</td>
                      <td className="tabular-nums text-[var(--sub)]">{when(t.lastActivityAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={card} aria-label="사용자">
            <h2 className={h2}>사용자 · {o.users.length}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--sub)]">
                  <tr><th className="py-1 pr-3">이름</th><th className="pr-3">이메일</th><th className="pr-3">팀</th><th className="pr-3">GitHub</th><th>Notion</th></tr>
                </thead>
                <tbody>
                  {o.users.map((u) => (
                    <tr key={u.id} className="border-t border-[var(--line)]">
                      <td className="py-1.5 pr-3 font-semibold">{u.name}</td>
                      <td className="pr-3 text-[var(--sub)]">{u.email}</td>
                      <td className="pr-3 tabular-nums">{u.teams}</td>
                      <td className="pr-3">{u.github ? "연결" : "—"}</td>
                      <td>{u.notion ? "연결" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-3" aria-label="시스템">
          <section className={card} aria-label="시스템 점검">
            <h2 className={h2}>시스템 점검 · {bad === 0 ? "모두 정상" : `확인 필요 ${bad}`}</h2>
            <ul className="space-y-2 text-sm">
              {checks.map((c) => (
                <li key={c.key}>
                  <span className="flex items-center gap-2">
                    <i className="inline-block h-2 w-2 rounded-full" style={{ background: c.ok ? "#5fb37c" : "#d9a441" }} aria-hidden />
                    {c.label}<span className="ml-auto text-[11px] text-[var(--sub)]">{c.ok ? "정상" : "확인 필요"}</span>
                  </span>
                  {!c.ok && <p className="pl-4 text-[11px] text-[var(--sub)]">{c.note}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-[var(--sub)]">값은 보여주지 않고 설정 여부만 표시해요.</p>
          </section>

          <section className={card} aria-label="최근 활동">
            <h2 className={h2}>최근 활동 (전체 팀)</h2>
            {o.recent.length === 0 && <p className="text-xs text-[var(--sub)]">아직 활동이 없어요.</p>}
            <ul className="max-h-96 space-y-1.5 overflow-y-auto text-xs">
              {o.recent.map((r, i) => (
                <li key={i} className="leading-snug">
                  <time className="mr-2 tabular-nums text-[var(--sub)]">{when(r.at)}</time>
                  <span className="text-[var(--sub)]">{r.teamName}</span> · <b>{r.userName}</b> {r.text}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
