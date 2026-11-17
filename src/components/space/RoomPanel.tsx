"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MeetingLinkForm } from "@/components/Forms";
import { RoleTag } from "./SideCards";
import type { MeetingView } from "./types";

type Tab = "summary" | "notes" | "materials";
const TABS: [Tab, string][] = [["summary", "정리"], ["notes", "메모"], ["materials", "자료"]];

const when = (at: number) => new Date(at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });

async function send(url: string, method: string, body?: unknown) {
  return fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const explain = (status: number) =>
  status === 409 ? "이미 확정된 회의예요." : status === 403 ? "권한이 없어요." : status === 400 ? "입력을 확인해 주세요." : status === 428 ? "먼저 내 공간에서 연결하세요." : "처리하지 못했어요. 잠시 후 다시 시도하세요.";

// What opens when you walk into the meeting room: every meeting, and for each its summary, your notes and its materials.
export function RoomPanel({ teamId, meetings, selectedId, onSelect }: { teamId: string; meetings: MeetingView[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("summary");
  const [starting, setStarting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  const m = meetings.find((x) => x.id === selectedId) ?? meetings[0] ?? null;

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const r = await send(`/api/offices/${teamId}/meetings`, "POST", { title });
    if (!r.ok) return setMsg(explain(r.status));
    const { meetingId } = await r.json();
    setTitle("");
    setStarting(false);
    setTab("notes");
    onSelect(meetingId);
    router.refresh();
  }

  return (
    <section className="px p-4" aria-label="회의실">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-bold">회의실</h2>
        <button className="px-btn" onClick={() => { setStarting((v) => !v); setImporting(false); }}>+ 새 회의 기록</button>
        <button className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm" onClick={() => { setImporting((v) => !v); setStarting(false); }}>Notion 링크로 가져오기</button>
      </div>
      {starting && (
        <form onSubmit={start} className="mb-3 flex gap-2">
          <input className="px-input" autoFocus placeholder="회의 제목 (예: 디자인 리뷰)" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} aria-label="회의 제목" />
          <button className="px-btn whitespace-nowrap" disabled={!title.trim()}>시작</button>
        </form>
      )}
      {importing && <div className="mb-3"><MeetingLinkForm officeId={teamId} /></div>}
      {msg && <p className="mb-2 text-sm font-semibold text-red-700">{msg}</p>}

      {meetings.length === 0 ? (
        <p className="text-sm text-[var(--sub)]">아직 회의가 없어요. "새 회의 기록"으로 시작하거나 Notion 회의록을 가져오세요.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <ul className="flex flex-col gap-1" aria-label="회의 목록">
            {meetings.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => onSelect(x.id)} aria-current={m?.id === x.id} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${m?.id === x.id ? "border-[var(--line)] bg-white" : "border-transparent hover:bg-white/60"}`}>
                  <span className="min-w-0">
                    <b className="block truncate font-semibold">{x.title}</b>
                    <span className="text-[11px] text-[var(--sub)]">{when(x.createdAt)}{x.fromNotion ? " · Notion" : " · 직접 기록"}</span>
                  </span>
                  <span className="chip shrink-0" style={{ background: x.status === "confirmed" ? "var(--done)" : "var(--doing)" }}>{x.status === "confirmed" ? "확정" : "초안"}</span>
                </button>
              </li>
            ))}
          </ul>
          {m && <MeetingDetail key={m.id} meeting={m} teamId={teamId} tab={tab} setTab={setTab} />}
        </div>
      )}
    </section>
  );
}

function MeetingDetail({ meeting: m, teamId, tab, setTab }: { meeting: MeetingView; teamId: string; tab: Tab; setTab: (t: Tab) => void }) {
  const router = useRouter();
  const [notes, setNotes] = useState(m.notes);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const locked = m.status === "confirmed" || m.fromNotion;
  useEffect(() => setNotes(m.notes), [m.notes]);

  async function saveNotes(): Promise<boolean> {
    setMsg("");
    const r = await send(`/api/meetings/${m.id}/notes`, "PUT", { notes });
    if (!r.ok) { setMsg(explain(r.status)); return false; }
    setSaved(true);
    return true;
  }
  async function summarize() {
    setBusy(true);
    setMsg("");
    // Save first so the summary uses what is on screen, not an older version.
    if (m.fromNotion || (await saveNotes())) {
      const r = await send(`/api/meetings/${m.id}/regenerate`, "POST");
      if (!r.ok) setMsg(r.status === 400 ? "먼저 메모를 적어 주세요." : r.status === 500 ? "AI 정리에 실패했어요. 서버의 AI 키(ANTHROPIC_API_KEY) 설정을 확인해 달라고 관리자에게 알려 주세요." : explain(r.status));
      else { setTab("summary"); router.refresh(); }
    }
    setBusy(false);
  }
  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const r = await send(`/api/meetings/${m.id}/links`, "POST", { title: linkTitle, url: linkUrl });
    if (!r.ok) return setMsg(r.status === 400 ? "http나 https로 시작하는 주소만 붙일 수 있어요." : explain(r.status));
    setLinkTitle(""); setLinkUrl("");
    router.refresh();
  }

  const links = [...(m.notionUrl ? [{ title: "Notion · 원문", url: m.notionUrl }] : []), ...m.links];

  return (
    <div className="min-w-0 rounded-lg border border-[var(--line)] bg-white p-4">
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--line)] pb-2" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1 text-sm ${tab === k ? "bg-[var(--panel)] font-semibold" : "text-[var(--sub)]"}`}>
            {label}{k === "materials" && links.length ? ` ${links.length}` : ""}
          </button>
        ))}
        <span className="ml-auto text-xs text-[var(--sub)]">{m.title}</span>
      </div>

      {tab === "summary" && (
        <div className="pt-3">
          <h3 className="text-xs font-semibold text-[var(--sub)]">결정 사항</h3>
          {m.decisions.length === 0 ? <p className="mt-1 text-sm text-[var(--sub)]">아직 정리된 내용이 없어요. 메모를 적고 "AI로 정리하기"를 눌러 보세요.</p> : (
            <ul className="mt-1 list-disc pl-5 text-sm leading-7">{m.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
          )}
          <h3 className="mt-4 text-xs font-semibold text-[var(--sub)]">할 일 · 역할로 담당자를 제안해요</h3>
          {m.todos.length === 0 ? <p className="mt-1 text-sm text-[var(--sub)]">할 일이 없어요.</p> : (
            <table className="mt-1 w-full text-sm">
              <tbody>
                {m.todos.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="py-2 pr-2">{t.title}</td>
                    <td className="py-2 pr-2">{t.role ? <RoleTag role={t.role} /> : <span className="text-[var(--sub)]">—</span>}</td>
                    <td className="py-2 pr-2">{t.assigneeName ?? <span className="text-[var(--sub)]">담당자 미정</span>}</td>
                    <td className="py-2 text-right text-xs">{t.issueUrl && t.issueUrl !== "pending" ? <a className="text-[var(--accent)] underline" href={t.issueUrl} target="_blank" rel="noopener noreferrer">이슈</a> : <span className="text-[var(--sub)]">{m.status === "confirmed" ? "이슈 전" : "확정 전"}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link className="px-btn" href={`/offices/${teamId}/meetings/${m.id}`}>{m.status === "confirmed" ? "이슈 만들기 · 자세히" : "고치고 확정하기"}</Link>
            {m.status === "draft" && (m.fromNotion || m.notes.trim()) && <button className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm" disabled={busy} onClick={summarize}>{busy ? "정리하는 중..." : "AI로 다시 정리"}</button>}
          </div>
        </div>
      )}

      {tab === "notes" && (
        <div className="pt-3">
          {m.fromNotion ? (
            <p className="text-sm text-[var(--sub)]">Notion에서 가져온 회의라 메모는 Notion에서 고쳐요. 직접 기록하려면 "새 회의 기록"을 눌러 주세요.</p>
          ) : (
            <>
              <label className="text-xs font-semibold text-[var(--sub)]" htmlFor={`notes-${m.id}`}>회의 중 메모 (직접 기록)</label>
              <textarea id={`notes-${m.id}`} className="px-input mt-1 min-h-48 leading-7" readOnly={locked} maxLength={20000} value={notes} placeholder={"예)\n10:02 목표: 금요일 시연\n10:05 디자인 톤은 쿨그레이로"} onChange={(e) => { setNotes(e.target.value); setSaved(false); }} />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!locked && <button className="px-btn" disabled={busy || !notes.trim()} onClick={summarize}>{busy ? "정리하는 중..." : "AI로 정리하기"}</button>}
                {!locked && <button className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm" disabled={busy} onClick={saveNotes}>저장</button>}
                {saved && <span className="text-xs text-[#1f6f43]">저장했어요</span>}
                {m.status === "confirmed" && <span className="text-xs text-[var(--sub)]">확정된 회의라 메모를 고칠 수 없어요.</span>}
              </div>
              <p className="mt-2 text-[11px] text-[var(--sub)]">정리하면 결정 사항과 할 일(역할 포함)로 바뀌고, 확인한 뒤 확정해요. 사람이 확인하기 전에는 이슈가 만들어지지 않아요.</p>
            </>
          )}
        </div>
      )}

      {tab === "materials" && (
        <div className="pt-3">
          {links.length === 0 ? <p className="text-sm text-[var(--sub)]">붙인 자료가 없어요.</p> : (
            <ul className="space-y-1.5 text-sm">
              {links.map((l, i) => (
                <li key={i}><a className="text-[var(--accent)] underline" href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a></li>
              ))}
            </ul>
          )}
          <form onSubmit={addLink} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <input className="px-input" placeholder="이름 (선택)" value={linkTitle} maxLength={100} onChange={(e) => setLinkTitle(e.target.value)} aria-label="자료 이름" />
            <input className="px-input" placeholder="https://..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} aria-label="자료 주소" />
            <button className="px-btn" disabled={!linkUrl.trim()}>+ 링크 추가</button>
          </form>
        </div>
      )}
      {msg && <p className="mt-2 text-sm font-semibold text-red-700">{msg}</p>}
    </div>
  );
}
