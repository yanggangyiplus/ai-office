import { describe, expect, it } from "vitest";
import { MY_ROOM, TEAM_MAP, TILE, isSolid, spawnPoint } from "./map";
import { moveStep, smoothPeer } from "./move";
import type { Position } from "../realtime/types";

const at = (col: number, row: number): Position => ({ x: col * TILE + TILE / 2, y: row * TILE + TILE / 2, dir: "down" });
const HALF = 6; // half of the 12px hitbox
const hits = (p: Position, m = TEAM_MAP) =>
  [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]].some(([dx, dy]) => isSolid(m, p.x + dx, p.y + dy));
const STEP = 9; // 90px/s for 100ms

describe("moveStep", () => {
  it("walks 9px in 100ms on open floor", () => {
    const p = moveStep(TEAM_MAP, at(30, 22), { dx: 1, dy: 0 }, 100);
    expect(p.x - at(30, 22).x).toBeCloseTo(STEP, 5);
    expect(p.y).toBe(at(30, 22).y);
  });

  it("walks diagonally at the same speed as straight", () => {
    const start = at(30, 22);
    const p = moveStep(TEAM_MAP, start, { dx: 1, dy: 1 }, 100);
    expect(Math.hypot(p.x - start.x, p.y - start.y)).toBeCloseTo(STEP, 5);
  });

  it("turns to face the way it walks", () => {
    expect(moveStep(TEAM_MAP, at(30, 22), { dx: -1, dy: 0 }, 50).dir).toBe("left");
    expect(moveStep(TEAM_MAP, at(30, 22), { dx: 0, dy: -1 }, 50).dir).toBe("up");
    expect(moveStep(TEAM_MAP, at(30, 22), { dx: 0, dy: 1 }, 50).dir).toBe("down");
    expect(moveStep(TEAM_MAP, at(30, 22), { dx: 1, dy: 0 }, 50).dir).toBe("right");
  });

  it("stands still with no input", () => {
    const start = at(30, 22);
    expect(moveStep(TEAM_MAP, start, { dx: 0, dy: 0 }, 100)).toEqual(start);
  });

  it("never walks into a wall, however long the key is held", () => {
    let p = at(3, 22);
    for (let i = 0; i < 300; i++) p = moveStep(TEAM_MAP, p, { dx: -1, dy: 0 }, 50);
    expect(hits(p)).toBe(false);
    expect(p.x).toBeGreaterThanOrEqual(TILE + HALF - 0.001);
  });

  it("slides along a wall when walking diagonally into it", () => {
    let p = at(2, 24);
    for (let i = 0; i < 40; i++) p = moveStep(TEAM_MAP, p, { dx: -1, dy: -1 }, 50);
    expect(hits(p)).toBe(false);
    expect(p.y).toBeLessThan(at(2, 24).y); // kept moving up while pressed against the left wall
  });

  it("stays inside the map walking any direction forever", () => {
    for (const input of [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 1 }, { dx: -1, dy: -1 }] as const) {
      let p = at(35, 25);
      for (let i = 0; i < 1500; i++) p = moveStep(TEAM_MAP, p, input, 50);
      expect(hits(p)).toBe(false);
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(TEAM_MAP.cols * TILE);
      expect(p.y).toBeLessThan(TEAM_MAP.rows * TILE);
    }
  });

  it("cannot be tunnelled through a wall by one huge time step (tab was in the background)", () => {
    const start = at(3, 22);
    const p = moveStep(TEAM_MAP, start, { dx: -1, dy: 0 }, 5000);
    expect(hits(p)).toBe(false);
    expect(start.x - p.x).toBeLessThanOrEqual(STEP + 0.001);
  });

  it("is stopped by a workstation's partition", () => {
    let p = at(16, 6); // just left of the first workstation
    for (let i = 0; i < 100; i++) p = moveStep(TEAM_MAP, p, { dx: 1, dy: 0 }, 50);
    expect(hits(p)).toBe(false);
    expect(p.x).toBeLessThan(17 * TILE);
  });

  it("works in the small room too", () => {
    let p = at(14, 9);
    for (let i = 0; i < 600; i++) p = moveStep(MY_ROOM, p, { dx: 1, dy: 1 }, 50);
    expect(hits(p, MY_ROOM)).toBe(false);
  });

  it("walks from the entrance into every seat with the real hitbox", () => {
    for (const seat of TEAM_MAP.seats) {
      const path = tilePath(spawnPoint(TEAM_MAP), seat);
      let p: Position = spawnPoint(TEAM_MAP);
      for (const target of path) {
        // 10ms steps are under 1px, so a step cannot overshoot the 1.5px arrival circle
        for (let i = 0; i < 2000 && (Math.abs(target.x - p.x) > 1.5 || Math.abs(target.y - p.y) > 1.5); i++) {
          const dx = Math.abs(target.x - p.x) > 1.5 ? (Math.sign(target.x - p.x) as -1 | 1) : 0;
          const dy = dx === 0 && Math.abs(target.y - p.y) > 1.5 ? (Math.sign(target.y - p.y) as -1 | 1) : 0;
          p = moveStep(TEAM_MAP, p, { dx, dy }, 10);
        }
        expect(Math.abs(target.x - p.x)).toBeLessThanOrEqual(1.5);
        expect(Math.abs(target.y - p.y)).toBeLessThanOrEqual(1.5);
      }
    }
  });
});

// Tile-centre waypoints from `from` to `to` over walkable tiles (breadth first search).
function tilePath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const key = (c: number, r: number) => `${c},${r}`;
  const start = { c: Math.floor(from.x / TILE), r: Math.floor(from.y / TILE) };
  const goal = { c: Math.floor(to.x / TILE), r: Math.floor(to.y / TILE) };
  const prev = new Map<string, string | null>([[key(start.c, start.r), null]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.c === goal.c && cur.r === goal.r) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = cur.c + dc;
      const r = cur.r + dr;
      if (prev.has(key(c, r)) || isSolid(TEAM_MAP, c * TILE + 8, r * TILE + 8)) continue;
      prev.set(key(c, r), key(cur.c, cur.r));
      queue.push({ c, r });
    }
  }
  const out: { x: number; y: number }[] = [];
  for (let k: string | null = key(goal.c, goal.r); k; k = prev.get(k) ?? null) {
    const [c, r] = k.split(",").map(Number);
    out.unshift({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
  }
  return out.slice(1);
}

describe("smoothPeer", () => {
  it("moves part of the way to a nearby target", () => {
    const s = smoothPeer({ x: 0, y: 0 }, { x: 40, y: 0 }, 16);
    expect(s.x).toBeGreaterThan(0);
    expect(s.x).toBeLessThan(40);
  });
  it("snaps to the target when it is far away (teleport / reconnect)", () => {
    expect(smoothPeer({ x: 0, y: 0 }, { x: 900, y: 0 }, 16)).toEqual({ x: 900, y: 0 });
  });
  it("converges on the target given enough time", () => {
    let s = { x: 0, y: 0 };
    for (let i = 0; i < 60; i++) s = smoothPeer(s, { x: 50, y: 30 }, 16);
    expect(Math.hypot(s.x - 50, s.y - 30)).toBeLessThan(1);
  });
});
