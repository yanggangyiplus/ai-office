"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(url: string, body: unknown) {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export function CreateOfficeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await post("/api/offices", { name });
        if (r.ok) router.push(`/offices/${(await r.json()).id}`);
      }}
    >
      <input className="px-input" placeholder="새 오피스 이름" value={name} onChange={(e) => setName(e.target.value)} required />
      <button className="px-btn whitespace-nowrap">만들기</button>
    </form>
  );
}

export function MeetingLinkForm({ officeId }: { officeId: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [msg, setMsg] = useState("");
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        const r = await post(`/api/offices/${officeId}/meetings`, { url });
        if (r.ok) return router.push(`/offices/${officeId}/meetings/${(await r.json()).meetingId}`);
        setState("error");
        setMsg(
          r.status === 422
            ? "이 링크는 사용할 수 없습니다. 관리자가 지정한 '회의록' 페이지 아래의 Notion 페이지인지 확인하세요."
            : r.status === 403
              ? "오피스 멤버만 올릴 수 있습니다."
              : "정리에 실패했습니다. Notion·AI 설정을 확인하세요.",
        );
      }}
    >
      <input className="px-input" placeholder="Notion 회의록 링크" value={url} onChange={(e) => setUrl(e.target.value)} required />
      <button className="px-btn" disabled={state === "busy"}>
        {state === "busy" ? "AI가 정리하는 중..." : "회의록 올리기"}
      </button>
      {state === "error" && <p className="text-sm font-bold text-red-700">{msg}</p>}
    </form>
  );
}

export function SettingsForm({ officeId, configured }: { officeId: string; configured: { notion: boolean; github: boolean } }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const g = (k: string) => String(f.get(k) ?? "").trim() || undefined;
        const repos = g("repos")?.split(/[\s,]+/).filter(Boolean);
        const r = await post(`/api/offices/${officeId}/settings`, {
          notionToken: g("notionToken"),
          notionParentPageId: g("notionParentPageId"),
          githubToken: g("githubToken"),
          repos,
          defaultRepo: repos?.[0],
        });
        setSaved(r.ok);
        if (r.ok) router.refresh();
      }}
    >
      <label className="font-bold">Notion 연동 토큰 ({configured.notion ? "설정됨" : "미설정"})</label>
      <input name="notionToken" type="password" className="px-input" placeholder="비워 두면 유지" autoComplete="off" />
      <label className="font-bold">Notion '회의록' 상위 페이지 ID</label>
      <input name="notionParentPageId" className="px-input" />
      <label className="font-bold">GitHub 토큰 ({configured.github ? "설정됨" : "미설정"})</label>
      <input name="githubToken" type="password" className="px-input" placeholder="비워 두면 유지" autoComplete="off" />
      <label className="font-bold">저장소 (owner/name, 쉼표로 구분 · 첫 번째가 기본)</label>
      <input name="repos" className="px-input" placeholder="team/app, team/docs" />
      <button className="px-btn self-start">저장</button>
      {saved && <p className="font-bold text-green-800">저장했습니다.</p>}
    </form>
  );
}

type Todo = { id: string; title: string; assigneeUserId: string | null; repo: string; description: string | null; issueUrl: string | null };

export function TodoEditor({
  meetingId,
  initial,
  members,
  repos,
}: {
  meetingId: string;
  initial: Todo[];
  members: { userId: string; name: string }[];
  repos: string[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const set = (i: number, p: Partial<Todo>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div className="flex flex-col gap-3">
      {rows.map((t, i) => (
        <div key={t.id} className="px flex flex-col gap-2 p-3">
          <input className="px-input" value={t.title} onChange={(e) => set(i, { title: e.target.value })} disabled={!!t.issueUrl} />
          <div className="flex gap-2">
            <select className="px-input" value={t.assigneeUserId ?? ""} disabled={!!t.issueUrl} onChange={(e) => set(i, { assigneeUserId: e.target.value || null })}>
              <option value="">담당자 미정</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.name}</option>
              ))}
            </select>
            <select className="px-input" value={t.repo} disabled={!!t.issueUrl} onChange={(e) => set(i, { repo: e.target.value })}>
              {[...new Set([t.repo, ...repos].filter(Boolean))].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          {t.issueUrl && <a className="underline" href={t.issueUrl}>이슈 보기</a>}
        </div>
      ))}
      <div className="flex gap-2">
        <button className="px-btn" onClick={() => setRows([...rows, { id: crypto.randomUUID(), title: "", assigneeUserId: null, repo: repos[0] ?? "", description: null, issueUrl: null }])}>
          + 할 일 추가
        </button>
        <button
          className="px-btn"
          onClick={async () => {
            const r = await post(`/api/meetings/${meetingId}/todos`, {
              todos: rows.filter((t) => !t.issueUrl && t.title.trim()).map(({ title, assigneeUserId, repo, description }) => ({ title, assigneeUserId, repo, description: description ?? undefined })),
            });
            if (r.ok) router.refresh();
          }}
        >
          수정 저장
        </button>
      </div>
    </div>
  );
}
