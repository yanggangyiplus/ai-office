import { describe, expect, it } from "vitest";
import { MY_ROOM, TEAM_MAP, TILE, deskSpots, interactTarget, isSolid, spawnPoint, type SpaceMap } from "./map";

const center = (col: number, row: number) => ({ x: col * TILE + TILE / 2, y: row * TILE + TILE / 2, dir: "down" as const });
const count = (m: SpaceMap, ch: string) => m.grid.join("").split(ch).length - 1;

describe("map data", () => {
  it.each([["TEAM_MAP", TEAM_MAP], ["MY_ROOM", MY_ROOM]])("%s rows match its declared size", (_n, m) => {
    expect(m.grid).toHaveLength(m.rows);
    for (const row of m.grid) expect(row).toHaveLength(m.cols);
  });

  it("MY_ROOM has exactly one computer, team board and door", () => {
    expect(count(MY_ROOM, "C")).toBe(1);
    expect(count(MY_ROOM, "T")).toBe(1);
    expect(count(MY_ROOM, "X")).toBe(1);
  });

  it("TEAM_MAP has 12 desks and one entrance zone, meeting zone and board zone", () => {
    expect(count(TEAM_MAP, "D")).toBe(12);
    expect(count(TEAM_MAP, "E")).toBeGreaterThan(0);
    expect(count(TEAM_MAP, "M")).toBeGreaterThan(0);
    expect(count(TEAM_MAP, "B")).toBeGreaterThan(0);
  });
});

describe("isSolid", () => {
  it("is true for walls, desks, objects and anything outside the map", () => {
    expect(isSolid(TEAM_MAP, 5, 5)).toBe(true); // corner wall
    expect(isSolid(TEAM_MAP, 3 * TILE + 5, 6 * TILE + 5)).toBe(true); // first desk
    expect(isSolid(MY_ROOM, 2 * TILE + 5, 2 * TILE + 5)).toBe(true); // computer
    expect(isSolid(TEAM_MAP, -1, 100)).toBe(true);
    expect(isSolid(TEAM_MAP, 100, TEAM_MAP.rows * TILE + 1)).toBe(true);
  });
  it("is false on open floor and on zone markers", () => {
    expect(isSolid(TEAM_MAP, 4 * TILE, 4 * TILE)).toBe(false);
    expect(isSolid(TEAM_MAP, 3 * TILE, 2 * TILE + 5)).toBe(false); // meeting zone
    expect(isSolid(TEAM_MAP, 21 * TILE, 2 * TILE + 5)).toBe(false); // board zone
  });
});

describe("deskSpots", () => {
  it("gives 12 distinct, walkable sitting spots", () => {
    const spots = deskSpots(TEAM_MAP);
    expect(spots).toHaveLength(12);
    expect(new Set(spots.map((s) => `${s.x},${s.y}`)).size).toBe(12);
    for (const s of spots) expect(isSolid(TEAM_MAP, s.x, s.y)).toBe(false);
  });
});

describe("interactTarget", () => {
  it("finds the meeting room when standing in or next to it", () => {
    expect(interactTarget(TEAM_MAP, center(3, 2))).toBe("meeting");
    expect(interactTarget(TEAM_MAP, center(3, 4))).toBe("meeting"); // one tile below
  });
  it("finds the board zone", () => {
    expect(interactTarget(TEAM_MAP, center(21, 2))).toBe("board");
  });
  it("returns null far from everything", () => {
    expect(interactTarget(TEAM_MAP, center(15, 12))).toBeNull();
  });
  it("finds the objects in my room when next to them", () => {
    expect(interactTarget(MY_ROOM, center(2, 3))).toBe("computer");
    expect(interactTarget(MY_ROOM, center(9, 3))).toBe("teamboard");
    expect(interactTarget(MY_ROOM, center(5, 6))).toBe("door");
  });
});

describe("spawnPoint", () => {
  it("starts on a walkable tile in both maps", () => {
    for (const m of [TEAM_MAP, MY_ROOM]) {
      const p = spawnPoint(m);
      expect(isSolid(m, p.x, p.y)).toBe(false);
    }
  });
  it("starts at the entrance of the team map", () => {
    const p = spawnPoint(TEAM_MAP);
    expect(TEAM_MAP.grid[Math.floor(p.y / TILE)][Math.floor(p.x / TILE)]).toBe("E");
  });
});
