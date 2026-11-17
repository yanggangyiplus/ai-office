import { describe, expect, it } from "vitest";
import { VIEW_H, VIEW_W, cameraFor } from "./camera";

const BIG = { cols: 72, rows: 36 }; // 1152 x 576
const SMALL = { cols: 28, rows: 18 }; // 448 x 288

describe("cameraFor near (follows the player at 2x)", () => {
  it("draws at 2x", () => {
    expect(cameraFor(BIG, "near", { x: 500, y: 300 }).scale).toBe(2);
  });
  it("puts the player in the middle of the view when there is room on every side", () => {
    const c = cameraFor(BIG, "near", { x: 560, y: 290 });
    expect((560 - c.x) * c.scale).toBeCloseTo(VIEW_W / 2, 5);
    expect((290 - c.y) * c.scale).toBeCloseTo(VIEW_H / 2, 5);
  });
  it("stops at the left and top edges of the map", () => {
    const c = cameraFor(BIG, "near", { x: 20, y: 20 });
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
  });
  it("stops at the right and bottom edges of the map", () => {
    const c = cameraFor(BIG, "near", { x: 1150, y: 575 });
    expect(c.x).toBe(1152 - VIEW_W / 2);
    expect(c.y).toBe(576 - VIEW_H / 2);
  });
  it("centres a map that is smaller than the view instead of following", () => {
    const c = cameraFor(SMALL, "near", { x: 10, y: 10 });
    expect(c.x).toBeCloseTo(-(VIEW_W / 2 - 448) / 2, 5);
    expect(c.y).toBeCloseTo(-(VIEW_H / 2 - 288) / 2, 5);
  });
  it("never shows more than the map's own size on a side that fits", () => {
    for (const p of [{ x: 0, y: 0 }, { x: 600, y: 300 }, { x: 1152, y: 576 }]) {
      const c = cameraFor(BIG, "near", p);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + VIEW_W / c.scale).toBeLessThanOrEqual(1152 + 1e-9);
    }
  });
});

describe("cameraFor fit (the whole map)", () => {
  it("scales the map to fit the view and centres it", () => {
    const c = cameraFor(BIG, "fit", { x: 0, y: 0 });
    expect(c.scale).toBeCloseTo(Math.min(VIEW_W / 1152, VIEW_H / 576), 5);
    expect(c.x * -1 * c.scale + 1152 * c.scale / 2).toBeCloseTo(VIEW_W / 2, 3);
    expect(c.y * -1 * c.scale + 576 * c.scale / 2).toBeCloseTo(VIEW_H / 2, 3);
  });
  it("does not depend on where the player is", () => {
    expect(cameraFor(BIG, "fit", { x: 0, y: 0 })).toEqual(cameraFor(BIG, "fit", { x: 900, y: 500 }));
  });
  it("blows a small room up to fill the view", () => {
    const c = cameraFor(SMALL, "fit", { x: 0, y: 0 });
    expect(c.scale).toBeCloseTo(Math.min(VIEW_W / 448, VIEW_H / 288), 5);
    expect(c.scale).toBeGreaterThan(2);
  });
});
