"use client";
import { useEffect, useRef, useState } from "react";
import { drawAvatar, drawBubble, drawHint, drawMap, drawNameTag } from "@/lib/space/draw";
import { TILE, deskSpots, interactTarget, type Interactable, type SpaceMap } from "@/lib/space/map";
import { moveStep, smoothPeer } from "@/lib/space/move";
import { shouldPublishMove, shouldRefreshPresence } from "@/lib/space/net";
import type { Position, Self, Transport } from "@/lib/realtime/types";

const SIZE = 32; // drawn size of a character (8x8 sprite x4)
const NAME: Record<Interactable, string> = { meeting: "회의실", board: "현황판", computer: "컴퓨터", teamboard: "팀 보드", door: "문" };
const MOVE_KEYS: Record<string, [number, number]> = {
  arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0], arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
};

type Peer = { self: Self; shown: { x: number; y: number }; target: Position };
type Props = {
  map: SpaceMap;
  self: Self;
  start: Position;
  transport: Transport | null; // null = walking alone (my room)
  deskOwners?: { name: string; desk: number }[];
  bubbles?: Record<string, string>; // speech bubble text by userId
  scale?: number;
  onInteract: (t: Interactable) => void;
};

// The walkable map. Everything is drawn on one canvas; people and the keyboard are handled here, the network lives behind `transport`.
export function SpaceCanvas(props: Props) {
  const { map, self, start, transport } = props;
  const scale = props.scale ?? 1;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props); // newest bubbles/desks/handlers without restarting the game loop
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

      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      drawMap(ctx, map);

      const spots = deskSpots(map);
      for (const o of latest.current.deskOwners ?? []) {
        const s = spots[o.desk];
        if (s) drawNameTag(ctx, o.name, s.x, s.y - TILE - 4, 0);
      }

      const frameOf = (m: boolean) => (m ? ((Math.floor(walkClock / 150) % 2) as 0 | 1) : 0);
      const people: { id: string; userId: string; name: string; x: number; y: number; dir: Position["dir"]; frame: 0 | 1; me: boolean }[] = [
        { id: self.id, userId: self.userId, name: self.name, x: pos.x, y: pos.y + SIZE / 2 - 6, dir: pos.dir, frame: frameOf(moving), me: true },
      ];
      for (const p of peers.values()) {
        p.shown = smoothPeer(p.shown, p.target, dt);
        const walking = Math.hypot(p.target.x - p.shown.x, p.target.y - p.shown.y) > 1.5;
        people.push({ id: p.self.id, userId: p.self.userId, name: p.self.name, x: p.shown.x, y: p.shown.y + SIZE / 2 - 6, dir: p.target.dir, frame: frameOf(walking), me: false });
      }
      people.sort((a, b) => a.y - b.y); // lower on screen is drawn later, in front
      for (const p of people) {
        drawAvatar(ctx, p.id, p.x, p.y, SIZE, p.dir, p.frame);
        drawNameTag(ctx, p.name, p.x, p.y, SIZE);
        const text = latest.current.bubbles?.[p.userId];
        if (text) drawBubble(ctx, text, p.x, p.y, SIZE);
        if (p.me) {
          const t = interactTarget(map, pos);
          if (t) drawHint(ctx, `E · ${NAME[t]}`, p.x, p.y);
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

  const w = map.cols * TILE * scale;
  const h = map.rows * TILE * scale;
  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: w }}>
      <canvas
        ref={canvasRef}
        width={w}
        height={h}
        role="img"
        aria-label="오피스 맵. 방향키 또는 WASD로 걷고, E 키나 클릭으로 가까운 곳을 사용합니다."
        className="block w-full border-4 border-black"
        style={{ imageRendering: "pixelated", aspectRatio: `${w} / ${h}` }}
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
