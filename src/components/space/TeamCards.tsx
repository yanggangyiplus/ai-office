"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_ITEM_CHARS, MAX_PER_KIND, MAX_TODAY_CHARS, type ItemKind, type TeamItem } from "@/lib/team-items-meta";
import type { MemberView } from "./types";

const card = "px p-4";
const h2 = "mb-2 text-xs font-semibold tracking-wide text-[var(--sub)]";

async function call(url: string, method: "POST" | "DELETE", body: unknown) {
  return fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

// One line about what I am doing today; teammates see it next to my name, so nobody has to ask.
export function TodayCard({ teamId, me }: { teamId: string; me: MemberView }) {
  const router = useRouter();
  const [text, setText] = useState(me.today);
  const [msg, setMsg] = useState("");
  return (
    <section className={card} aria-label="오늘 한 줄">
      <h2 className={h2}>오늘 한 줄 · 팀원에게 보여요</h2>
      <form
        className="flex gap-1.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await call(`/api/offices/${teamId}/today`, "POST", { today: text });
          setMsg(r.ok ? "저장했어요" : "저장하지 못했어요");
          if (r.ok) router.refresh();
        }}
      >
        <input className="px-input" value={text} maxLength={MAX_TODAY_CHARS} placeholder="예) 로그인 화면 마무리" aria-label="오늘 한 줄" onChange={(e) => { setText(e.target.value); setMsg(""); }} />
        <button className="px-btn whitespace-nowrap">저장</button>
      </form>
      {msg && <p className="mt-1 text-xs text-[var(--sub)]">{msg}</p>}
    </section>
  );
}

const KIND_TABS: [ItemKind, string, string][] = [
  ["notice", "공지", "예) 금요일 오후 3시 시연"],
  ["rule", "규칙", "예) PR은 하루 안에 리뷰한다"],
  ["link", "자료", "자료 이름 (비워도 돼요)"],
];

// The team's own rules, notices and shared links. Anyone can add; the author or the admin can remove.
export function TeamRulesCard({ teamId, items, isAdmin }: { teamId: string; items: TeamItem[]; isAdmin: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<ItemKind>("notice");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const shown = items.filter((i) => i.kind === kind).sort((a, b) => (kind === "notice" ? b.at - a.at : a.at - b.at));
  const placeholder = KIND_TABS.find((t) => t[0] === kind)![2];

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const r = await call(`/api/offices/${teamId}/items`, "POST", { kind, title, url });
    if (!r.ok) return setErr(r.status === 400 ? (kind === "link" ? "http나 https로 시작하는 주소를 넣어 주세요." : `내용을 확인해 주세요 (${MAX_ITEM_CHARS}자까지, 종류마다 ${MAX_PER_KIND}개까지).`) : "저장하지 못했어요.");
    setTitle(""); setUrl("");
    router.refresh();
  }
  async function remove(id: string) {
    const r = await call(`/api/offices/${teamId}/items`, "DELETE", { id });
    if (r.ok) router.refresh();
    else setErr("지우지 못했어요.");
  }

  return (
    <section className={card} aria-label="팀 규칙과 공지">
      <h2 className={h2}>우리 팀 · 공지 / 규칙 / 자료</h2>
      <div className="mb-2 flex gap-1" role="tablist">
        {KIND_TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setErr(""); }} className={`rounded-md px-2.5 py-1 text-xs ${kind === k ? "bg-[var(--panel)] font-semibold" : "text-[var(--sub)]"}`}>
            {label} {items.filter((i) => i.kind === k).length}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-xs text-[var(--sub)]">아직 없어요. 아래에서 추가해 보세요.</p>}
      <ul className="space-y-1.5 text-sm">
        {shown.map((i) => (
          <li key={i.id} className="flex items-start gap-2 leading-snug">
            <span className="flex-1 break-words">
              {i.url ? <a className="text-[var(--accent)] underline" href={i.url} target="_blank" rel="noopener noreferrer">{i.title}</a> : i.title}
              <small className="ml-1.5 text-[11px] text-[var(--sub)]">{i.authorName}</small>
            </span>
            {(i.mine || isAdmin) && <button className="text-[11px] text-[var(--sub)] underline" aria-label={`${i.title} 지우기`} onClick={() => remove(i.id)}>지우기</button>}
          </li>
        ))}
      </ul>
      <form className="mt-2 flex flex-col gap-1.5" onSubmit={add}>
        {kind === "link" && <input className="px-input" value={url} placeholder="https://..." aria-label="자료 주소" onChange={(e) => setUrl(e.target.value)} />}
        <div className="flex gap-1.5">
          <input className="px-input" value={title} placeholder={placeholder} aria-label="내용" maxLength={MAX_ITEM_CHARS} onChange={(e) => setTitle(e.target.value)} />
          <button className="px-btn whitespace-nowrap" disabled={kind === "link" ? !url.trim() : !title.trim()}>추가</button>
        </div>
      </form>
      {err && <p className="mt-1 text-xs font-semibold text-red-700">{err}</p>}
    </section>
  );
}
