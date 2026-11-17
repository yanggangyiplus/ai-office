"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { MeetingLinkForm } from "@/components/Forms";
import type { WorkItem } from "@/lib/github";
import { AblyTransport } from "@/lib/realtime/ably";
import { LocalTransport } from "@/lib/realtime/local";
import type { ChatMessage, Position, Transport } from "@/lib/realtime/types";
import { TEAM_MAP, type Interactable } from "@/lib/space/map";
import { ChatPanel } from "./ChatPanel";
import { SpaceCanvas } from "./SpaceCanvas";

type BoardRow = { member: { userId: string; name: string }; doing: WorkItem[]; next: WorkItem[]; done: WorkItem[] };
type Panel = "meeting" | "board" | "invite" | null;
const COLS = [
  { key: "doing", label: "하는 중", color: "var(--doing)" },
  { key: "next", label: "다음", color: "var(--next)" },
  { key: "done", label: "끝남", color: "var(--done)" },
] as const;

function BoardPanel({ board, note }: { board: BoardRow[]; note: string }) {
  return (
    <div className="flex flex-col gap-3">
      {note && <p className="text-sm">{note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {board.map((row) => (
          <div key={row.member.userId} className="border-2 border-black p-2">
            <div className="mb-1 flex items-center gap-2">
              <Avatar id={row.member.userId} size={32} />
              <strong>{row.member.name}</strong>
            </div>
            {COLS.map((c) => (
              <div key={c.key} className="text-sm">
                <span className="border-2 border-black px-1 text-xs font-bold" style={{ background: c.color }}>
                  {c.label} {row[c.key].length}
                </span>
                <ul className="mb-1 list-inside list-disc">
                  {row[c.key].slice(0, 4).map((i) => (
                    <li key={`${i.repo}#${i.number}`}>{i.title}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function InvitePanel({ teamId }: { teamId: string }) {
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <button
        className="px-btn self-start"
        onClick={async () => {
          setErr("");
          const r = await fetch(`/api/offices/${teamId}/invite`, { method: "POST" });
          if (r.ok) setLink(`${location.origin}/join/${(await r.json()).code}`);
          else setErr("초대 링크를 만들지 못했어요.");
        }}
      >
        초대 링크 만들기
      </button>
      {link && <input readOnly className="px-input" value={link} onFocus={(e) => e.currentTarget.select()} aria-label="초대 링크" />}
      {err && <p className="text-sm font-bold text-red-700">{err}</p>}
    </div>
  );
}

// The team's shared office: walk around with the others, open the meeting room and the status board, chat.
export function TeamSpace(props: {
  team: { id: string; name: string; isAdmin: boolean };
  me: { id: string; name: string };
  mode: "ably" | "local" | "blocked";
  start: Position;
  deskOwners: { name: string; desk: number }[];
  meetings: { id: string; title: string; status: "draft" | "confirmed" }[];
  board: BoardRow[];
  boardNote: string;
  initialChat: ChatMessage[];
}) {
  const { team, me, mode } = props;
  const [panel, setPanel] = useState<Panel>(null);
  const [messages, setMessages] = useState(props.initialChat);
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [tabId] = useState(() => crypto.randomUUID());

  // Ably: one character per account. Local dev: one per tab, so two tabs can be tried side by side.
  const self = useMemo(
    () => ({ id: mode === "ably" ? me.id : `${me.id}:${tabId}`, userId: me.id, name: me.name }),
    [mode, me.id, me.name, tabId],
  );
  const transport = useMemo<Transport | null>(
    () => (mode === "ably" ? new AblyTransport(team.id) : mode === "local" ? new LocalTransport(team.id) : null),
    [mode, team.id],
  );

  const addMessage = useCallback((m: ChatMessage) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m].slice(-200)));
    setBubbles((b) => ({ ...b, [m.userId]: m.body }));
    clearTimeout(timers.current[m.userId]);
    timers.current[m.userId] = setTimeout(() => {
      setBubbles((b) => {
        const rest = { ...b };
        delete rest[m.userId];
        return rest;
      });
    }, 6000);
  }, []);

  useEffect(() => {
    const t = timers.current;
    const off = transport?.onChat(addMessage);
    return () => {
      off?.();
      Object.values(t).forEach(clearTimeout);
    };
  }, [transport, addMessage]);

  const open = (t: Interactable) => {
    if (t === "meeting" || t === "board") setPanel(t);
  };

  const links = (
    <nav className="flex flex-wrap gap-3 text-sm text-white" aria-label="이동">
      <Link href="/me" className="underline">내 공간으로</Link>
      <Link href={`/offices/${team.id}`} className="underline">목록으로 보기</Link>
      {team.isAdmin && <Link href={`/offices/${team.id}/settings`} className="underline">팀 설정</Link>}
    </nav>
  );

  if (mode === "blocked") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
        <header className="flex items-center justify-between text-white"><h1 className="text-2xl font-bold">{team.name}</h1>{links}</header>
        <p className="px p-4">
          실시간 서비스(Ably)가 아직 설정되지 않아 걸어 다니는 팀 공간에는 들어갈 수 없어요. 관리자가 서버에 ABLY_API_KEY를 설정하면 열립니다.
          그동안은 위의 &quot;목록으로 보기&quot;로 회의와 현황판을 쓸 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2 text-white">
        <h1 className="text-2xl font-bold">{team.name}</h1>
        {links}
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <div className="floor border-4 border-black p-3">
            <SpaceCanvas
              map={TEAM_MAP}
              self={self}
              start={props.start}
              transport={transport}
              scene="team"
              zoom="near"
              owners={props.deskOwners.map((d) => ({ desk: d.desk, name: d.name, roles: [], me: d.name === me.name, state: "off" as const }))}
              bubbles={bubbles}
              onInteract={open}
            />
          </div>

          {/* Same things as buttons for keyboard and screen-reader users */}
          <nav className="flex flex-wrap gap-3" aria-label="팀 공간 메뉴">
            <button className="px-btn" onClick={() => setPanel("meeting")}>회의실 열기</button>
            <button className="px-btn" onClick={() => setPanel("board")}>현황판 열기</button>
            {team.isAdmin && <button className="px-btn" onClick={() => setPanel("invite")}>초대</button>}
          </nav>

          {panel && (
            <section className="px flex flex-col gap-3 p-4" aria-label={panel === "meeting" ? "회의실" : panel === "board" ? "현황판" : "초대"}>
              <div className="flex items-center justify-between">
                <h2 className="font-bold">{panel === "meeting" ? "회의실" : panel === "board" ? "현황판" : "초대"}</h2>
                <button className="underline" onClick={() => setPanel(null)}>닫기</button>
              </div>
              {panel === "meeting" && (
                <>
                  <MeetingLinkForm officeId={team.id} />
                  <ul className="flex flex-col gap-1 text-sm">
                    {props.meetings.length === 0 && <li>아직 올라온 회의가 없어요.</li>}
                    {props.meetings.map((m) => (
                      <li key={m.id}>
                        <Link className="underline" href={`/offices/${team.id}/meetings/${m.id}`}>{m.title}</Link>{" "}
                        <span className="border-2 border-black px-1 text-xs" style={{ background: m.status === "confirmed" ? "var(--done)" : "var(--doing)" }}>
                          {m.status === "confirmed" ? "확정" : "초안"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {panel === "board" && <BoardPanel board={props.board} note={props.boardNote} />}
              {panel === "invite" && <InvitePanel teamId={team.id} />}
            </section>
          )}
        </div>

        <ChatPanel
          teamId={team.id}
          messages={messages}
          myUserId={me.id}
          onSent={(m) => {
            addMessage(m);
            transport?.sendChat(m); // local dev relays to other tabs; Ably already got it from the server
          }}
        />
      </div>
    </div>
  );
}
