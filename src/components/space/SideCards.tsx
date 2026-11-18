"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActivityItem } from "@/lib/activity";
import type { BoardRow } from "@/lib/board";
import { MAX_ROLES, MAX_ROLE_CHARS, PRESET_ROLES, roleColor } from "@/lib/role-meta";
import { filterBoardByRole, myProgress, teamProgress } from "@/lib/progress";
import { STATUS_COLOR, STATUS_LABEL, type MeetingView, type MemberView } from "./types";

const card = "px p-4";
const h2 = "mb-2 text-xs font-semibold tracking-wide text-[var(--sub)]";

export function Bar({ percent, color = "var(--accent)" }: { percent: number; color?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[#e3e8ee]" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${percent}%`, background: color }} />
    </div>
  );
}

export function RoleTag({ role }: { role: string }) {
  return (
    <span className="rounded-full px-2 py-px text-[10px] font-semibold text-white" style={{ background: roleColor(role) }}>
      {role}
    </span>
  );
}

export function TeamProgressCard({ board }: { board: BoardRow[] }) {
  const p = teamProgress(board);
  return (
    <section className={card} aria-label="팀 진행률">
      <h2 className={h2}>팀 진행률</h2>
      <div className="text-3xl font-bold tracking-tight">
        {p.percent}%<small className="ml-2 text-xs font-medium text-[var(--sub)]">{p.done} / {p.total} 완료</small>
      </div>
      <div className="mt-2"><Bar percent={p.percent} /></div>
      <div className="mt-2 flex gap-1.5">
        <span className="chip">하는 중 {p.doing}</span><span className="chip">다음 {p.next}</span><span className="chip">끝남 {p.done}</span>
      </div>
    </section>
  );
}

export function MyProgressCard({ board, me }: { board: BoardRow[]; me: { id: string; name: string } }) {
  const p = myProgress(board, me.id);
  return (
    <section className={card} aria-label="내 진행도">
      <h2 className={h2}>내 진행도 · {me.name}</h2>
      <div className="text-3xl font-bold tracking-tight">
        {p.percent}%<small className="ml-2 text-xs font-medium text-[var(--sub)]">{p.done} / {p.total} 완료</small>
      </div>
      <div className="mt-2"><Bar percent={p.percent} /></div>
      <p className="mt-2 text-xs text-[var(--sub)]">
        {p.total === 0 ? "아직 나에게 할당된 일이 없어요." : (
          <>지금: {p.now ? p.now.title : "없음"}<br />다음: {p.next ? p.next.title : "없음"}</>
        )}
      </p>
    </section>
  );
}

// Pick your own roles (several allowed). Presets plus anything you type.
export function RolesCard({ teamId, me }: { teamId: string; me: MemberView }) {
  const router = useRouter();
  const [roles, setRoles] = useState(me.roles);
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState("");
  const options = [...PRESET_ROLES, ...roles.filter((r) => !PRESET_ROLES.some((p) => p.toLowerCase() === r.toLowerCase()))];
  const has = (r: string) => roles.some((x) => x.toLowerCase() === r.toLowerCase());

  async function save(next: string[]) {
    setErr("");
    const before = roles;
    setRoles(next);
    const r = await fetch(`/api/offices/${teamId}/roles`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roles: next }) });
    if (r.ok) router.refresh();
    else {
      setRoles(before);
      setErr(r.status === 400 ? `역할은 ${MAX_ROLES}개까지, 한 역할은 ${MAX_ROLE_CHARS}자까지예요.` : "저장하지 못했어요.");
    }
  }
  const toggle = (r: string) => save(has(r) ? roles.filter((x) => x.toLowerCase() !== r.toLowerCase()) : [...roles, r]);

  return (
    <section className={card} aria-label="내 역할">
      <h2 className={h2}>내 역할 · 여러 개 선택 가능</h2>
      <div className="flex flex-wrap gap-1.5">
        {options.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={has(r)}
            onClick={() => toggle(r)}
            className="rounded-full border px-2.5 py-1 text-xs"
            style={has(r) ? { background: roleColor(r), borderColor: roleColor(r), color: "#fff", fontWeight: 600 } : { borderColor: roleColor(r), color: roleColor(r), background: "#fff" }}
          >
            {has(r) ? "✓ " : ""}{r}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const v = custom.trim();
          if (v && !has(v)) save([...roles, v]);
          setCustom("");
        }}
      >
        <input className="px-input" placeholder="+ 직접 입력 (예: 데이터)" value={custom} maxLength={MAX_ROLE_CHARS} onChange={(e) => setCustom(e.target.value)} aria-label="역할 직접 입력" />
        <button className="px-btn whitespace-nowrap" disabled={!custom.trim()}>추가</button>
      </form>
      <p className="mt-2 text-[11px] text-[var(--sub)]">고른 역할은 내 자리 이름표와 팀원 목록에 보여요.</p>
      {err && <p className="mt-1 text-xs font-semibold text-red-700">{err}</p>}
    </section>
  );
}

// Members with their progress; the role chips filter the list.
export function MembersProgressCard({ board, members, me }: { board: BoardRow[]; members: MemberView[]; me: string }) {
  const [role, setRole] = useState<string | null>(null);
  const rolesByUser = Object.fromEntries(members.map((m) => [m.userId, m.roles]));
  const roleList = [...new Set(members.flatMap((m) => m.roles))];
  const rows = teamProgress(filterBoardByRole(board, rolesByUser, role)).members;
  return (
    <section className={card} aria-label="팀원별 진행도">
      <h2 className={h2}>팀원별 · 역할로 보기</h2>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={role === null} onClick={() => setRole(null)} className="rounded-full border px-2.5 py-1 text-xs" style={role === null ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : { background: "#fff" }}>전체</button>
        {roleList.map((r) => (
          <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(role === r ? null : r)} className="rounded-full border px-2.5 py-1 text-xs"
            style={role === r ? { background: roleColor(r), color: "#fff", borderColor: roleColor(r) } : { color: roleColor(r), borderColor: roleColor(r), background: "#fff" }}>{r}</button>
        ))}
      </div>
      {rows.length === 0 && <p className="text-xs text-[var(--sub)]">이 역할을 가진 팀원이 없어요.</p>}
      {rows.map((m) => (
        <div key={m.userId} className="mt-2 grid grid-cols-[56px_1fr_36px] items-center gap-2 text-xs">
          <span className={m.userId === me ? "font-bold text-[var(--accent)]" : ""}>{m.name}</span>
          <Bar percent={m.percent} />
          <b className="text-right font-semibold text-[var(--sub)]">{m.done}/{m.total}</b>
        </div>
      ))}
    </section>
  );
}

export function TodayMeetingsCard({ meetings, onOpen }: { meetings: MeetingView[]; onOpen: (id: string) => void }) {
  return (
    <section className={card} aria-label="최근 회의">
      <h2 className={h2}>최근 회의</h2>
      {meetings.length === 0 && <p className="text-xs text-[var(--sub)]">아직 회의가 없어요. 회의실에서 시작해 보세요.</p>}
      {meetings.slice(0, 3).map((m) => (
        <button key={m.id} type="button" onClick={() => onOpen(m.id)} className="mt-1.5 flex w-full items-center justify-between text-left text-sm hover:underline">
          <span className="truncate">{m.title}</span>
          <span className="chip" style={{ background: m.status === "confirmed" ? "var(--done)" : "var(--doing)" }}>{m.status === "confirmed" ? "확정" : "초안"}</span>
        </button>
      ))}
    </section>
  );
}

const hhmm = (at: number) => new Date(at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

export function ActivityCard({ items }: { items: ActivityItem[] }) {
  return (
    <section className={card} aria-label="활동 피드">
      <h2 className={h2}>활동 피드</h2>
      {items.length === 0 && <p className="text-xs text-[var(--sub)]">아직 활동이 없어요.</p>}
      <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs">
        {items.map((a) => (
          <li key={a.id} className="leading-snug">
            <time className="mr-2 tabular-nums text-[var(--sub)]">{hhmm(a.at)}</time>
            <b>{a.name}</b> {a.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PresenceCard({ members }: { members: MemberView[] }) {
  const here = members.filter((m) => m.present).length;
  return (
    <section className={card} aria-label="팀원">
      <h2 className={h2}>팀원 · 출근 {here} / {members.length}</h2>
      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-1.5 text-sm">
            <i className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[m.present ? m.status : "off"] }} aria-hidden />
            <span>{m.name}</span>
            {m.roles.map((r) => <RoleTag key={r} role={r} />)}
            <span className="ml-auto text-[11px] text-[var(--sub)]">{m.present ? STATUS_LABEL[m.status] : "퇴근"}</span>
            {m.today && <p className="w-full pl-3.5 text-xs text-[var(--sub)]">“{m.today}”</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
