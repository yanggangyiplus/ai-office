import type { Dir, Position } from "../realtime/types";
import { isSolid, type SpaceMap } from "./map";

const SPEED = 140; // px per second
const HALF = 10; // the character's hitbox is 20x20
const MAX_DT = 100; // ms; a longer gap (tab in background) counts as 100ms so nobody tunnels through a wall

const blocked = (map: SpaceMap, x: number, y: number) =>
  isSolid(map, x - HALF, y - HALF) || isSolid(map, x + HALF, y - HALF) || isSolid(map, x - HALF, y + HALF) || isSolid(map, x + HALF, y + HALF);

// Moves each axis on its own, so walking diagonally into a wall slides along it. The map edge is wall.
export function moveStep(
  map: SpaceMap,
  pos: Position,
  input: { dx: -1 | 0 | 1; dy: -1 | 0 | 1 },
  dtMs: number,
): Position {
  if (input.dx === 0 && input.dy === 0) return pos;
  const len = Math.hypot(input.dx, input.dy);
  const step = (SPEED * Math.min(Math.max(dtMs, 0), MAX_DT)) / 1000;
  const vx = (input.dx / len) * step;
  const vy = (input.dy / len) * step;
  let { x, y } = pos;
  if (!blocked(map, x + vx, y)) x += vx;
  if (!blocked(map, x, y + vy)) y += vy;
  const dir: Dir = input.dx < 0 ? "left" : input.dx > 0 ? "right" : input.dy < 0 ? "up" : "down";
  return { x, y, dir };
}

// Draws other people a little behind their real position so 5 updates a second look like walking.
export function smoothPeer(
  shown: { x: number; y: number },
  target: { x: number; y: number },
  dtMs: number,
): { x: number; y: number } {
  if (Math.hypot(target.x - shown.x, target.y - shown.y) > 160) return { x: target.x, y: target.y };
  const a = 1 - Math.exp(-Math.max(dtMs, 0) / 80);
  return { x: shown.x + (target.x - shown.x) * a, y: shown.y + (target.y - shown.y) * a };
}
