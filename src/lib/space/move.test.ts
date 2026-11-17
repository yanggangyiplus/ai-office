import { describe, expect, it } from "vitest";
import { MY_ROOM, TEAM_MAP, TILE, isSolid } from "./map";
import { moveStep, smoothPeer } from "./move";
import type { Position } from "../realtime/types";

const at = (col: number, row: number): Position => ({ x: col * TILE + TILE / 2, y: row * TILE + TILE / 2, dir: "down" });
const HALF = 10; // half of the 20px hitbox
const hits = (p: Position) =>
  [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]].some(([dx, dy]) => isSolid(TEAM_MAP, p.x + dx, p.y + dy));

describe("moveStep", () => {
  it("walks 14px in 100ms on open floor", () => {
    const p = moveStep(TEAM_MAP, at(10, 12), { dx: 1, dy: 0 }, 100);
    expect(p.x - at(10, 12).x).toBeCloseTo(14, 5);
    expect(p.y).toBe(at(10, 12).y);
  });

  it("walks diagonally at the same speed as straight", () => {
    const start = at(10, 12);
    const p = moveStep(TEAM_MAP, start, { dx: 1, dy: 1 }, 100);
    expect(Math.hypot(p.x - start.x, p.y - start.y)).toBeCloseTo(14, 5);
  });

  it("turns to face the way it walks", () => {
    expect(moveStep(TEAM_MAP, at(10, 12), { dx: -1, dy: 0 }, 50).dir).toBe("left");
    expect(moveStep(TEAM_MAP, at(10, 12), { dx: 0, dy: -1 }, 50).dir).toBe("up");
    expect(moveStep(TEAM_MAP, at(10, 12), { dx: 0, dy: 1 }, 50).dir).toBe("down");
    expect(moveStep(TEAM_MAP, at(10, 12), { dx: 1, dy: 0 }, 50).dir).toBe("right");
  });

  it("stands still with no input", () => {
    const start = at(10, 12);
    expect(moveStep(TEAM_MAP, start, { dx: 0, dy: 0 }, 100)).toEqual(start);
  });

  it("never walks into a wall, however long the key is held", () => {
    let p = at(2, 12);
    for (let i = 0; i < 200; i++) p = moveStep(TEAM_MAP, p, { dx: -1, dy: 0 }, 50);
    expect(hits(p)).toBe(false);
    expect(p.x).toBeGreaterThanOrEqual(TILE + HALF - 0.001);
  });

  it("slides along a wall when walking diagonally into it", () => {
    let p = at(2, 12);
    for (let i = 0; i < 20; i++) p = moveStep(TEAM_MAP, p, { dx: -1, dy: -1 }, 50);
    expect(hits(p)).toBe(false);
    expect(p.y).toBeLessThan(at(2, 12).y); // kept moving up while pressed against the left wall
  });

  it("stays inside the map walking any direction forever", () => {
    for (const input of [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 1 }, { dx: -1, dy: -1 }] as const) {
      let p = at(15, 12);
      for (let i = 0; i < 400; i++) p = moveStep(TEAM_MAP, p, input, 50);
      expect(hits(p)).toBe(false);
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(TEAM_MAP.cols * TILE);
      expect(p.y).toBeLessThan(TEAM_MAP.rows * TILE);
    }
  });

  it("cannot be tunnelled through a wall by one huge time step (tab was in the background)", () => {
    const start = at(2, 12);
    const p = moveStep(TEAM_MAP, start, { dx: -1, dy: 0 }, 5000);
    expect(hits(p)).toBe(false);
    expect(start.x - p.x).toBeLessThanOrEqual(14.001);
  });

  it("is blocked by desks", () => {
    // first desk is at tile (3,6); stand just left of it and walk right
    let p = at(1, 6);
    for (let i = 0; i < 100; i++) p = moveStep(TEAM_MAP, p, { dx: 1, dy: 0 }, 50);
    expect(hits(p)).toBe(false);
    expect(p.x).toBeLessThan(3 * TILE);
  });

  it("works in the small room too", () => {
    let p = at(5, 4);
    for (let i = 0; i < 300; i++) p = moveStep(MY_ROOM, p, { dx: 1, dy: 1 }, 50);
    expect(isSolid(MY_ROOM, p.x, p.y)).toBe(false);
  });
});

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
