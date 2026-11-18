"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityItem } from "@/lib/activity";
import type { BoardRow } from "@/lib/board";
import { teamProgress } from "@/lib/progress";
import { AblyTransport } from "@/lib/realtime/ably";
import { LocalTransport } from "@/lib/realtime/local";
import type { ChatMessage, Position, Transport } from "@/lib/realtime/types";
import type { Zoom } from "@/lib/space/camera";
import { TEAM_MAP, statusSpot, type Interactable } from "@/lib/space/map";
import { ChatPanel } from "./ChatPanel";
import { RoomPanel } from "./RoomPanel";
import type { TeamItem } from "@/lib/team-items-meta";
import { ActivityCard, MembersProgressCard, MyProgressCard, PresenceCard, RolesCard, TeamProgressCard, TodayMeetingsCard, RoleTag } from "./SideCards";
import { TeamRulesCard, TodayCard } from "./TeamCards";
import { SpaceCanvas } from "./SpaceCanvas";
import { STATUS_LABEL, type MeetingView, type MemberView } from "./types";

type Panel = "meeting" | "board" | "entrance" | "invite" | null;
const STATUSES = ["working", "meeting", "away", "meal"] as const;
const ghost = "rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm";

function BoardPanel({ board, note }: { board: BoardRow[]; note: string }) {
  return (
    <div className="flex flex-col gap-3">
      {note && <p className="text-sm text-[var(--sub)]">{note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {board.map((row) => (
          <div key={row.member.userId} className="rounded-lg border border-[var(--line)] bg-white p-3">
            <b className="text-sm">{row.member.name}</b>
            {([["하는 중", row.doing, "var(--doing)"], ["다음", row.next, "var(--next)"], ["끝남", row.done, "var(--done)"]] as const).map(([label, items, color]) => (
              <div key={label} className="mt-2 text-sm">
                <span className="chip" style={{ background: color }}>{label} {items.length}</span>
                <ul className="mt-1 list-inside list-disc text-xs">{items.slice(0, 4).map((i) => <li key={`${i.repo}#${i.number}`}>{i.title}</li>)}</ul>
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
      <button className="px-btn self-start" onClick={async () => {
        setErr("");
        const r = await fetch(`/api/offices/${teamId}/invite`, { method: "POST" });
        if (r.ok) setLink(`${location.origin}/join/${(await r.json()).code}`);
        else setErr("초대 링크를 만들지 못했어요.");
      }}>초대 링크 만들기</button>
      {link && <input readOnly className="px-input" value={link} onFocus={(e) => e.currentTarget.select()} aria-label="초대 링크" />}
      {err && <p className="text-sm font-semibold text-red-700">{err}</p>}
    </div>
  );
}

// At the entrance: clock in or out, and say what you are up to.
function AttendancePanel({ teamId, me }: { teamId: string; me: MemberView }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  async function act(body: unknown) {
    setErr("");
    const r = await fetch(`/api/offices/${teamId}/attendance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) router.refresh();
    else setErr(r.status === 400 ? "먼저 출근해 주세요." : "처리하지 못했어요. 잠시 후 다시 시도하세요.");
  }
  return (
    <div className="flex flex-col gap-3">
      {!me.present ? (
        <>
          <p className="text-sm text-[var(--sub)]">아직 출근 전이에요. 출근하면 팀원들에게 보이고, 상태도 고를 수 있어요.</p>
          <button className="px-btn self-start" onClick={() => act({ action: "in" })}>출근하기</button>
        </>
      ) : (
        <>
          <p className="text-sm">지금 상태: <b>{STATUS_LABEL[me.status]}</b></p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="상태 선택">
            {STATUSES.map((s) => (
              <button key={s} aria-pressed={me.status === s} className={me.status === s ? "px-btn" : ghost} onClick={() => act({ action: "status", status: s })}>{STATUS_LABEL[s]}</button>
            ))}
          </div>
          <button className={`${ghost} self-start`} onClick={() => act({ action: "out" })}>퇴근하기</button>
        </>
      )}
      {err && <p className="text-sm font-semibold text-red-700">{err}</p>}
    </div>
  );
}

// The team's shared office: walk around with the others, open the meeting room and the status board, chat, clock in.
export function TeamSpace(props: {
  team: { id: string; name: string; isAdmin: boolean };
  me: { id: string; name: string };
  mode: "ably" | "local" | "blocked";
  start: Position;
  members: MemberView[];
  meetings: MeetingView[];
  board: BoardRow[];
  boardNote: string;
  initialChat: ChatMessage[];
  feed: ActivityItem[];
  items: TeamItem[];
}) {
  const { team, me, mode, members, meetings, board } = props;
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [zoom, setZoom] = useState<Zoom>("near");
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState(props.initialChat);
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [tabId] = useState(() => crypto.randomUUID());
  const panelRef = useRef<HTMLDivElement>(null);

  const mine = members.find((m) => m.userId === me.id)!;

  // Picking a status walks you to its zone (like the reference office); the first render does not move anyone.
  const [warp, setWarp] = useState<(Position & { n: number }) | null>(null);
  const status = mine.present ? mine.status : null;
  const [seenStatus, setSeenStatus] = useState(status);
  if (status !== seenStatus) {
    setSeenStatus(status);
    const spot = status && statusSpot(TEAM_MAP, status, mine.desk ?? null);
    if (spot) setWarp({ ...spot, n: (warp?.n ?? 0) + 1 });
  }
  const progress = teamProgress(board);
  const confirmed = meetings.filter((m) => m.status === "confirmed").length;

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

  const owners = members.filter((m) => m.desk != null).map((m) => ({
    desk: m.desk as number, userId: m.userId, name: m.name, roles: m.roles, me: m.userId === me.id, state: (m.present ? m.status : "off") as "off" | MemberView["status"],
  }));
  const rolesByUser = Object.fromEntries(members.map((m) => [m.userId, m.roles]));

  const open = (p: Panel) => {
    setPanel(p);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const onInteract = (t: Interactable) => {
    if (t === "meeting") open("meeting");
    else if (t === "board") open("board");
    else if (t === "entrance") open("entrance");
  };

  const links = (
    <nav className="flex flex-wrap gap-2 text-sm" aria-label="이동">
      <Link href="/me" className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[var(--sub)]">내 공간</Link>
      <Link href={`/offices/${team.id}`} className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[var(--sub)]">목록으로 보기</Link>
      {team.isAdmin && <Link href={`/offices/${team.id}/settings`} className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[var(--sub)]">팀 설정</Link>}
    </nav>
  );

  if (mode === "blocked") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
        <header className="flex items-center justify-between"><h1 className="text-xl font-bold">{team.name}</h1>{links}</header>
        <p className="px p-4">
          실시간 서비스(Ably)가 아직 설정되지 않아 걸어 다니는 팀 공간에는 들어갈 수 없어요. 관리자가 서버에 ABLY_API_KEY를 설정하면 열립니다.
          그동안은 위의 &quot;목록으로 보기&quot;로 회의와 현황판을 쓸 수 있어요.
        </p>
      </div>
    );
  }

  const stat = (label: string, value: string | number) => (
    <span className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--sub)]">{label} <b className="ml-1 tabular-nums text-[var(--ink)]">{value}</b></span>
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pb-8">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] py-3">
        <h1 className="text-base font-bold">{team.name}</h1>
        <span className={`rounded-full border px-3 py-1 text-xs ${mine.present ? "border-[#cfe8d9] bg-[#f1faf4] text-[#1f6f43]" : "border-[var(--line)] bg-white text-[var(--sub)]"}`}>
          {mine.present ? `● ${STATUS_LABEL[mine.status]}` : "○ 출근 전"}
        </span>
        <span className="flex-1" />
        {links}
      </header>

      <section className="flex flex-wrap items-center gap-2 py-3" aria-label="요약">
        {stat("출근", `${members.filter((m) => m.present).length} / ${members.length}`)}
        {stat("하는 중", progress.doing)}
        {stat("다음", progress.next)}
        {stat("끝남", progress.done)}
        {stat("팀 진행률", `${progress.percent}%`)}
        <span className="flex-1" />
        <div className="flex overflow-hidden rounded-lg border border-[var(--line)] bg-white text-xs" role="group" aria-label="보기 크기">
          {(["near", "fit"] as const).map((z) => (
            <button key={z} aria-pressed={zoom === z} onClick={() => setZoom(z)} className={`px-3 py-1.5 ${zoom === z ? "bg-[var(--ink)] text-white" : ""}`}>{z === "near" ? "가까이" : "전체 보기"}</button>
          ))}
        </div>
        <button className={mine.present ? ghost : "px-btn"} onClick={() => open("entrance")}>{mine.present ? "상태 · 퇴근" : "출근하기"}</button>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <SpaceCanvas
            map={TEAM_MAP}
            scene="team"
            zoom={zoom}
            self={self}
            start={props.start}
            transport={transport}
            owners={owners}
            teamPercent={progress.percent}
            meetingText={`확정 ${confirmed} · 초안 ${meetings.length - confirmed}`}
            rolesByUser={rolesByUser}
            bubbles={bubbles}
            warp={warp}
            onInteract={onInteract}
          />

          {/* The same things as buttons, for keyboard and screen-reader users */}
          <nav className="flex flex-wrap gap-2" aria-label="팀 공간 메뉴">
            <button className={ghost} onClick={() => open("meeting")}>회의실 열기</button>
            <button className={ghost} onClick={() => open("board")}>현황판 열기</button>
            <button className={ghost} onClick={() => open("entrance")}>입구 · 출퇴근</button>
            {team.isAdmin && <button className={ghost} onClick={() => open("invite")}>초대</button>}
          </nav>

          <div ref={panelRef}>
            {panel === "meeting" && <RoomPanel teamId={team.id} meetings={meetings} selectedId={selected} onSelect={setSelected} />}
            {panel && panel !== "meeting" && (
              <section className="px p-4" aria-label={panel === "board" ? "현황판" : panel === "entrance" ? "입구" : "초대"}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-bold">{panel === "board" ? "현황판" : panel === "entrance" ? "입구 · 출퇴근" : "초대"}</h2>
                  <button className="text-sm text-[var(--sub)] underline" onClick={() => setPanel(null)}>닫기</button>
                </div>
                {panel === "board" && <BoardPanel board={board} note={props.boardNote} />}
                {panel === "entrance" && <AttendancePanel teamId={team.id} me={mine} />}
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

        <aside className="flex flex-col gap-3" aria-label="팀 정보">
          <TeamProgressCard board={board} />
          <MyProgressCard board={board} me={me} />
          <TodayCard teamId={team.id} me={mine} />
          <TeamRulesCard teamId={team.id} items={props.items} isAdmin={team.isAdmin} />
          <RolesCard teamId={team.id} me={mine} />
          <MembersProgressCard board={board} members={members} me={me.id} />
          <TodayMeetingsCard meetings={meetings} onOpen={(id) => { setSelected(id); open("meeting"); }} />
          <ActivityCard items={props.feed} />
          <PresenceCard members={members} />
        </aside>
      </div>
      <p className="mt-3 text-[11px] text-[var(--sub)]">{mine.roles.length ? <>내 역할: {mine.roles.map((r) => <span key={r} className="mr-1 inline-block align-middle"><RoleTag role={r} /></span>)}</> : "역할을 고르면 자리 이름표에 표시돼요."} · 새로고침하지 않아도 출근·상태는 동작 직후 반영돼요.</p>
    </div>
  );
}
