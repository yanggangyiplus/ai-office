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

// My own small room: walk to the computer (connections), the team board (pick a team) or the door (sign out).
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

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between text-white">
        <h1 className="text-2xl font-bold">{user.name}의 공간</h1>
        <span className="text-sm">방향키/WASD로 걷고 E 키나 클릭으로 사용해요</span>
      </header>

      <div className="floor border-4 border-black p-4">
        <SpaceCanvas map={MY_ROOM} self={self} start={start} transport={null} scale={2} onInteract={open} />
      </div>

      {/* The same things as buttons, for keyboard and screen-reader users */}
      <nav className="flex flex-wrap gap-3" aria-label="내 공간 메뉴">
        <button className="px-btn" onClick={() => setPanel("computer")}>컴퓨터 열기</button>
        <button className="px-btn" onClick={() => setPanel("teamboard")}>팀 보드 열기</button>
        <button className="px-btn" onClick={() => setPanel("door")}>문 열기</button>
      </nav>

      {panel && (
        <section className="px flex flex-col gap-4 p-4" aria-label={TITLE[panel]}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{TITLE[panel]}</h2>
            <button className="underline" onClick={() => setPanel(null)}>닫기</button>
          </div>

          {panel === "computer" && <ConnectionsPanel status={status} />}

          {panel === "teamboard" && (
            <div className="flex flex-col gap-4">
              {teams.length === 0 && <p>아직 속한 팀이 없어요. 새 팀을 만들거나 초대 링크로 들어오세요.</p>}
              <ul className="flex flex-col gap-2">
                {teams.map((t) => (
                  <li key={t.id} className="flex items-center justify-between border-2 border-black p-2">
                    <strong>{t.name}</strong>
                    <Link className="px-btn" href={`/teams/${t.id}`}>입장하기</Link>
                  </li>
                ))}
              </ul>
              <div>
                <h3 className="mb-2 font-bold">새 팀 만들기</h3>
                <CreateOfficeForm />
              </div>
              <div>
                <h3 className="mb-2 font-bold">초대 받았어요</h3>
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
  );
}
