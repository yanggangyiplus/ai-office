"use client";
import { useEffect, useRef, useState } from "react";
import { VIEW_H, VIEW_W, cameraFor, type Zoom } from "@/lib/space/camera";
import { drawBubble, drawHint, drawPerson, nameTag, rect, roleTags } from "@/lib/space/draw";
import { TILE, interactTarget, type Interactable, type SpaceMap } from "@/lib/space/map";
import { moveStep, smoothPeer } from "@/lib/space/move";
import { shouldPublishMove, shouldRefreshPresence } from "@/lib/space/net";
import { drawRoomScene, drawTeamScene, type DeskOwner } from "@/lib/space/scene";
import type { Position, Self, Transport } from "@/lib/realtime/types";

const FOOT = 6; // the hitbox is centred on the player; the feet are at its bottom edge
const NAME: Record<Interactable, string> = { meeting: "회의실", board: "현황판", computer: "컴퓨터", teamboard: "팀 보드", door: "문", entrance: "입구" };
const MOVE_KEYS: Record<string, [number, number]> = {
  arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0], arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
};

type Peer = { self: Self; shown: { x: number; y: number }; target: Position };
type Props = {
  map: SpaceMap;
  scene: "team" | "room";
  self: Self;
  start: Position;
  transport: Transport | null; // null = walking alone (my room)
  zoom: Zoom;
  owners?: DeskOwner[]; // who sits at which workstation (name, roles, status dot)
  teamPercent?: number;
  meetingText?: string;
  rolesByUser?: Record<string, string[]>; // role tags above walking characters
  bubbles?: Record<string, string>; // speech bubble text by userId
  onInteract: (t: Interactable) => void;
};

// The walkable map. Everything is drawn on one canvas with a camera that follows the player; the network lives behind `transport`.
export function SpaceCanvas(props: Props) {
  const { map, self, start, transport } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props); // newest owners/bubbles/zoom/handlers without restarting the game loop
  latest.current = props;
  const [kicked, setKicked] = useState(false);
  const [failed, setFailed] = useState(false);
  const kickedRef = useRef(false); // the loop stops publishing once this tab was kicked
  kickedRef.current = kicked;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let alive = true;
    let pos = start;
    let lastSent: { at: number; x: number; y: number } | null = null;
    let lastPresenceAt = 0;
    let wasMoving = false;
    let walkClock = 0;
    let last = performance.now();
    let raf = 0;
    const keys = new Set<string>();
    const peers = new Map<string, Peer>();

    const typing = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable);
    };
    const interact = () => {
      const t = interactTarget(map, pos);
      if (t) latest.current.onInteract(t);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k in MOVE_KEYS) e.preventDefault();
      keys.add(k);
      if (k === "e") interact();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const onBlur = () => keys.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    canvas.addEventListener("click", interact);

    const unsub: (() => void)[] = [];
    if (transport) {
      unsub.push(
        transport.onPeers((list) => {
          const ids = new Set(list.map((p) => p.id));
          for (const id of [...peers.keys()]) if (!ids.has(id)) peers.delete(id);
          for (const p of list) {
            const target = { x: p.x, y: p.y, dir: p.dir };
            peers.set(p.id, { self: { id: p.id, userId: p.userId, name: p.name }, shown: peers.get(p.id)?.shown ?? { x: p.x, y: p.y }, target });
          }
        }),
        transport.onMove((id, p) => {
          const peer = peers.get(id);
          if (peer) peer.target = p;
        }),
        transport.onKicked(() => alive && setKicked(true)),
      );
      transport.connect(self, start).catch(() => alive && setFailed(true));
    }

    const loop = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      const p = latest.current;

      let dx = 0;
      let dy = 0;
      if (!typing()) for (const k of keys) { const v = MOVE_KEYS[k]; if (v) { dx += v[0]; dy += v[1]; } }
      const next = moveStep(map, pos, { dx: Math.sign(dx) as -1 | 0 | 1, dy: Math.sign(dy) as -1 | 0 | 1 }, dt);
      const moving = next.x !== pos.x || next.y !== pos.y;
      pos = next;
      if (moving) walkClock += dt;

      if (transport && !kickedRef.current) {
        const justStopped = wasMoving && !moving;
        if ((moving && shouldPublishMove(lastSent, now, pos)) || justStopped) {
          transport.publishMove(pos);
          lastSent = { at: now, x: pos.x, y: pos.y };
        }
        if (shouldRefreshPresence(lastPresenceAt, now, moving, justStopped)) {
          transport.setPresence(pos).catch(() => {});
          lastPresenceAt = now;
        }
      }
      wasMoving = moving;

      // camera: world -> screen
      const cam = cameraFor(map, p.zoom, pos);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      rect(ctx, 0, 0, VIEW_W, VIEW_H, "#cfd6de"); // outside the map (letterbox) reads as wall
      ctx.setTransform(cam.scale, 0, 0, cam.scale, -cam.x * cam.scale, -cam.y * cam.scale);
      if (p.scene === "team") drawTeamScene(ctx, { owners: p.owners ?? [], teamPercent: p.teamPercent ?? 0, meetingText: p.meetingText ?? "" });
      else drawRoomScene(ctx);

      const frameOf = (m: boolean) => (m ? ((Math.floor(walkClock / 150) % 2) as 0 | 1) : 0);
      const people: { id: string; userId: string; name: string; x: number; foot: number; dir: Position["dir"]; frame: 0 | 1; me: boolean }[] = [
        { id: self.id, userId: self.userId, name: self.name, x: pos.x, foot: pos.y + FOOT, dir: pos.dir, frame: frameOf(moving), me: true },
      ];
      for (const peer of peers.values()) {
        peer.shown = smoothPeer(peer.shown, peer.target, dt);
        const walking = Math.hypot(peer.target.x - peer.shown.x, peer.target.y - peer.shown.y) > 1.5;
        people.push({ id: peer.self.userId, userId: peer.self.userId, name: peer.self.name, x: peer.shown.x, foot: peer.shown.y + FOOT, dir: peer.target.dir, frame: frameOf(walking), me: false });
      }
      people.sort((a, b) => a.foot - b.foot); // lower on screen is drawn later, in front
      for (const q of people) {
        drawPerson(ctx, q.id, q.x, q.foot, q.dir, q.frame, q.me);
        // Sitting at their own desk the desk plate already shows who this is, so skip the tags above the head.
        const desk = p.owners?.find((o) => o.userId === q.userId)?.desk;
        const seat = desk != null ? map.seats[desk] : undefined;
        const atOwnDesk = !!seat && Math.hypot(q.x - seat.x, q.foot - FOOT - seat.y) < 28;
        if (!atOwnDesk) {
          roleTags(ctx, p.rolesByUser?.[q.userId] ?? [], q.x, q.foot - 23 - 15 - 13);
          nameTag(ctx, q.name, q.x, q.foot);
        }
        const text = p.bubbles?.[q.userId];
        if (text) drawBubble(ctx, text, q.x, q.foot);
        if (q.me) {
          const t = interactTarget(map, pos);
          if (t) drawHint(ctx, `E · ${NAME[t]}`, q.x, q.foot);
        }
      }

      if (alive) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("click", interact);
      unsub.forEach((u) => u());
      void transport?.close();
    };
    // The loop restarts only when the map, the connection or the identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, transport, self.id]);

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        width={VIEW_W}
        height={VIEW_H}
        role="img"
        aria-label="오피스 맵. 방향키 또는 WASD로 걷고, E 키나 클릭으로 가까운 곳을 사용합니다."
        className="block w-full rounded-md border"
        style={{ imageRendering: "pixelated", aspectRatio: `${VIEW_W} / ${VIEW_H}`, borderColor: "var(--line)", background: "#e8ebf0" }}
      />
      {kicked && (
        <div className="px absolute inset-0 m-auto flex h-24 w-4/5 items-center justify-center p-4 text-center font-bold">
          다른 곳에서 접속했습니다. 이 탭에서는 연결이 끊어졌어요.
        </div>
      )}
      {failed && (
        <div className="px absolute inset-0 m-auto flex h-24 w-4/5 items-center justify-center p-4 text-center font-bold">
          실시간 연결에 실패했습니다. 새로고침해 보세요.
        </div>
      )}
    </div>
  );
}

export { TILE };
