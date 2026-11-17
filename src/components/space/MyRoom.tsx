"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { signOutAction } from "@/app/actions";
import { ConnectionsPanel } from "@/components/ConnectionsPanel";
import { CreateOfficeForm } from "@/components/Forms";
import { inviteCodeFrom } from "@/lib/invite";
import { MY_ROOM, spawnPoint, type Interactable } from "@/lib/space/map";
import { SpaceCanvas } from "./SpaceCanvas";

type Panel = "computer" | "teamboard" | "door" | null;
const TITLE: Record<Exclude<Panel, null>, string> = { computer: "컴퓨터 · 연결", teamboard: "팀 보드", door: "문" };
const ghost = "rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm";
const card = "px p-4";
const h2 = "mb-2 text-xs font-semibold tracking-wide text-[var(--sub)]";

function JoinByCode() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const code = inviteCodeFrom(text);
        if (code) router.push(`/join/${code}`);
        else setErr("초대 링크나 코드를 확인하세요.");
      }}
    >
      <input className="px-input" placeholder="초대 링크 또는 코드" value={text} onChange={(e) => setText(e.target.value)} aria-label="초대 링크 또는 코드" />
      <button className="px-btn whitespace-nowrap">입장</button>
      {err && <span className="self-center text-sm font-bold text-red-700">{err}</span>}
    </form>
  );
}

const connected = (on: boolean) =>
  on ? "border-[#cfe8d9] bg-[#f1faf4] text-[#1f6f43]" : "border-[var(--line)] bg-white text-[var(--sub)]";

// My own small room, laid out like the team space: top bar, the room, and cards on the right.
// Walk to the computer (connections), the team board (pick a team) or the door (sign out).
export function MyRoom({
  user,
  teams,
  status,
}: {
  user: { id: string; name: string };
  teams: { id: string; name: string }[];
  status: { github: boolean; notion: boolean };
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const self = useMemo(() => ({ id: user.id, userId: user.id, name: user.name }), [user.id, user.name]);
  const start = useMemo(() => spawnPoint(MY_ROOM), []);
  const open = (t: Interactable) => {
    if (t === "computer" || t === "teamboard" || t === "door") setPanel(t);
  };

  const stat = (label: string, value: string | number) => (
    <span className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--sub)]">{label} <b className="ml-1 tabular-nums text-[var(--ink)]">{value}</b></span>
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pb-8">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] py-3">
        <h1 className="text-base font-bold">{user.name}의 공간</h1>
        <span className={`rounded-full border px-3 py-1 text-xs ${connected(status.github)}`}>{status.github ? "● GitHub 연결됨" : "○ GitHub 미연결"}</span>
        <span className={`rounded-full border px-3 py-1 text-xs ${connected(status.notion)}`}>{status.notion ? "● Notion 연결됨" : "○ Notion 미연결"}</span>
        <span className="flex-1" />
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="이동">
          <button className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[var(--sub)]" onClick={() => setPanel("door")}>로그아웃</button>
        </nav>
      </header>

      <section className="flex flex-wrap items-center gap-2 py-3" aria-label="요약">
        {stat("속한 팀", teams.length)}
        {stat("GitHub", status.github ? "연결됨" : "미연결")}
        {stat("Notion", status.notion ? "연결됨" : "미연결")}
        <span className="flex-1" />
        <span className="text-xs text-[var(--sub)]">방향키/WASD로 걷고 E 키나 클릭으로 사용해요</span>
        <button className="px-btn" onClick={() => setPanel("teamboard")}>팀 보드 열기</button>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <SpaceCanvas map={MY_ROOM} scene="room" zoom="fit" self={self} start={start} transport={null} onInteract={open} />

          {/* The same things as buttons, for keyboard and screen-reader users */}
          <nav className="flex flex-wrap gap-2" aria-label="내 공간 메뉴">
            <button className={ghost} onClick={() => setPanel("computer")}>컴퓨터 열기</button>
            <button className={ghost} onClick={() => setPanel("teamboard")}>팀 보드 열기</button>
            <button className={ghost} onClick={() => setPanel("door")}>문 열기</button>
          </nav>

          {panel && (
            <section className="px flex flex-col gap-4 p-4" aria-label={TITLE[panel]}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">{TITLE[panel]}</h2>
                <button className="text-sm text-[var(--sub)] underline" onClick={() => setPanel(null)}>닫기</button>
              </div>

              {panel === "computer" && <ConnectionsPanel status={status} />}

              {panel === "teamboard" && (
                <div className="flex flex-col gap-4">
                  {teams.length === 0 && <p className="text-sm text-[var(--sub)]">아직 속한 팀이 없어요. 새 팀을 만들거나 초대 링크로 들어오세요.</p>}
                  <ul className="flex flex-col gap-2">
                    {teams.map((t) => (
                      <li key={t.id} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-white p-2 pl-3">
                        <strong className="text-sm">{t.name}</strong>
                        <Link className="px-btn" href={`/teams/${t.id}`}>입장하기</Link>
                      </li>
                    ))}
                  </ul>
                  <div>
                    <h3 className="mb-2 text-sm font-bold">새 팀 만들기</h3>
                    <CreateOfficeForm />
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-bold">초대 받았어요</h3>
                    <JoinByCode />
                  </div>
                </div>
              )}

              {panel === "door" && (
                <form action={signOutAction}>
                  <button className="px-btn">로그아웃</button>
                </form>
              )}
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-3" aria-label="내 정보">
          <section className={card} aria-label="내 팀">
            <h2 className={h2}>내 팀 · {teams.length}</h2>
            {teams.length === 0 && <p className="text-xs text-[var(--sub)]">아직 속한 팀이 없어요. 팀 보드에서 만들거나 초대 링크로 들어오세요.</p>}
            <ul className="space-y-2">
              {teams.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-semibold">{t.name}</span>
                  <Link className="px-btn whitespace-nowrap" href={`/teams/${t.id}`}>입장하기</Link>
                </li>
              ))}
            </ul>
          </section>

          <section className={card} aria-label="연결">
            <h2 className={h2}>내 연결</h2>
            <ul className="space-y-2 text-sm">
              {([["GitHub", status.github], ["Notion", status.notion]] as const).map(([name, on]) => (
                <li key={name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <i className="inline-block h-2 w-2 rounded-full" style={{ background: on ? "#5fb37c" : "#b9c2cc" }} aria-hidden />
                    {name}
                  </span>
                  <span className="text-[11px] text-[var(--sub)]">{on ? "연결됨" : "미연결"}</span>
                </li>
              ))}
            </ul>
            <button className={`${ghost} mt-3 w-full`} onClick={() => setPanel("computer")}>컴퓨터에서 {status.github && status.notion ? "다시 설정" : "연결하기"}</button>
          </section>

          <section className={card} aria-label="조작 안내">
            <h2 className={h2}>이렇게 써요</h2>
            <ul className="space-y-1.5 text-xs leading-relaxed text-[var(--sub)]">
              <li><b className="text-[var(--ink)]">컴퓨터</b> GitHub·Notion을 내 계정으로 연결</li>
              <li><b className="text-[var(--ink)]">팀 보드</b> 팀을 골라 입장, 새 팀 만들기, 초대 받기</li>
              <li><b className="text-[var(--ink)]">문</b> 로그아웃</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
