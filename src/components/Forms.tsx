"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PostButton } from "./PostButton";

async function post(url: string, body: unknown) {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export function CreateOfficeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [github, setGithub] = useState("");
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await post("/api/offices", { name, githubUsername: github });
        if (r.ok) router.push(`/offices/${(await r.json()).id}`);
      }}
    >
      <input className="px-input" placeholder="새 오피스 이름" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className="px-input" placeholder="내 GitHub 사용자명 (현황판에 내 일이 보이려면 필요)" value={github} onChange={(e) => setGithub(e.target.value)} />
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
        const reason = r.status === 422 ? await r.text() : "";
        setMsg(
          r.status === 428
            ? "먼저 내 공간에서 Notion을 연결하세요. (내 공간의 컴퓨터에서 토큰을 붙여넣으면 됩니다)"
            : reason === "too_long"
            ? "회의록이 너무 깁니다(3만 자 초과). 나눠서 올려 주세요."
            : reason === "not_under_parent"
              ? "관리자가 지정한 '회의록' 페이지 아래에 있는 Notion 페이지가 아닙니다."
              : reason === "not_found"
                ? "Notion 페이지를 읽을 수 없습니다. 링크가 맞는지, 연동이 그 페이지에 연결되어 있는지 확인하세요."
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

// Team settings only: tokens are personal now and live in each person's own space (/me).
export function SettingsForm({ officeId }: { officeId: string }) {
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
          notionParentPageId: g("notionParentPageId"),
          repos,
          defaultRepo: repos?.[0],
        });
        setSaved(r.ok);
        if (r.ok) router.refresh();
      }}
    >
      <p className="text-sm">GitHub·Notion 연결은 각자 내 공간에서 합니다. 여기서는 팀이 함께 쓰는 설정만 정해요.</p>
      <label className="font-bold">Notion '회의록' 상위 페이지 ID</label>
      <input name="notionParentPageId" className="px-input" />
      <label className="font-bold">저장소 (owner/name, 쉼표로 구분 · 첫 번째가 기본)</label>
      <input name="repos" className="px-input" placeholder="team/app, team/docs" />
      <button className="px-btn self-start">저장</button>
      {saved && <p className="font-bold text-green-800">저장했습니다.</p>}
    </form>
  );
}

type Todo = { id: string; title: string; assigneeUserId: string | null; repo: string; description: string | null; issueUrl: string | null };

const snapshot = (rows: Todo[]) => JSON.stringify(rows.map(({ title, assigneeUserId, repo }) => [title, assigneeUserId, repo]));

export function TodoEditor({
  meetingId,
  confirmed,
  initial,
  members,
  repos,
}: {
  meetingId: string;
  confirmed: boolean;
  initial: Todo[];
  members: { userId: string; name: string }[];
  repos: string[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initial.filter((t) => !t.issueUrl).map((t) => t.id)));
  const [saveError, setSaveError] = useState("");
  // Confirm and issue creation read the saved rows on the server, so unsaved edits must be saved first.
  const dirty = snapshot(rows) !== snapshot(initial);
  const hint = "수정한 내용을 먼저 '수정 저장'으로 저장하세요.";
  const set = (i: number, p: Partial<Todo>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickedIds = rows.filter((t) => !t.issueUrl && picked.has(t.id)).map((t) => t.id);

  return (
    <div className="flex flex-col gap-3">
      {rows.map((t, i) => (
        <div key={t.id} className="px flex flex-col gap-2 p-3">
          {confirmed && !t.issueUrl && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} />
              이슈로 만들기
            </label>
          )}
          <input className="px-input" value={t.title} onChange={(e) => set(i, { title: e.target.value })} disabled={!!t.issueUrl} />
          <div className="flex gap-2">
            <select className="px-input" value={t.assigneeUserId ?? ""} disabled={!!t.issueUrl} onChange={(e) => set(i, { assigneeUserId: e.target.value || null })}>
              <option value="">담당자 미정</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.name}</option>
              ))}
            </select>
            <select className="px-input" value={t.repo} disabled={!!t.issueUrl} onChange={(e) => set(i, { repo: e.target.value })}>
              {[...new Set(["", t.repo, ...repos])].map((r) => (
                <option key={r} value={r}>{r || "저장소 미정"}</option>
              ))}
            </select>
          </div>
          {t.issueUrl && t.issueUrl !== "pending" && <a className="underline" href={t.issueUrl}>이슈 보기</a>}
          {t.issueUrl === "pending" && <span className="text-sm">이슈 만드는 중...</span>}
        </div>
      ))}

      <div className="flex flex-wrap items-start gap-3">
        <button className="px-btn" onClick={() => setRows([...rows, { id: crypto.randomUUID(), title: "", assigneeUserId: null, repo: repos[0] ?? "", description: null, issueUrl: null }])}>
          + 할 일 추가
        </button>
        <button
          className="px-btn"
          disabled={!dirty}
          onClick={async () => {
            setSaveError("");
            const r = await post(`/api/meetings/${meetingId}/todos`, {
              todos: rows.filter((t) => !t.issueUrl && t.title.trim()).map(({ title, assigneeUserId, repo, description }) => ({ title, assigneeUserId, repo, description: description ?? undefined })),
            });
            if (r.ok) router.refresh();
            else setSaveError(r.status === 400 ? "저장소나 담당자가 이 오피스에 없는 값입니다." : "저장하지 못했습니다.");
          }}
        >
          수정 저장
        </button>
        {!confirmed && <PostButton url={`/api/meetings/${meetingId}/regenerate`} disabled={dirty} hint={hint}>AI로 다시 정리</PostButton>}
        {!confirmed && <PostButton url={`/api/meetings/${meetingId}/confirm`} disabled={dirty} hint={hint}>확정</PostButton>}
        {confirmed && pickedIds.length > 0 && (
          <PostButton url={`/api/meetings/${meetingId}/issues`} body={{ todoIds: pickedIds }} disabled={dirty} hint={hint}>
            선택한 {pickedIds.length}개 GitHub 이슈 만들기
          </PostButton>
        )}
      </div>
      {dirty && <p className="text-sm font-bold">저장하지 않은 수정이 있습니다. 저장해야 확정·이슈 만들기를 할 수 있어요.</p>}
      {saveError && <p className="text-sm font-bold text-red-700">{saveError}</p>}
    </div>
  );
}
