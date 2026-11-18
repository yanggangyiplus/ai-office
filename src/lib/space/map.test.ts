import { describe, expect, it } from "vitest";
import { MY_ROOM, TEAM_MAP, TILE, deskSpots, interactTarget, isSolid, spawnPoint, statusSpot, type SpaceMap } from "./map";

const center = (col: number, row: number) => ({ x: col * TILE + TILE / 2, y: row * TILE + TILE / 2, dir: "down" as const });
const count = (m: SpaceMap, ch: string) => m.grid.join("").split(ch).length - 1;
const solidAt = (m: SpaceMap, col: number, row: number) => isSolid(m, col * TILE + 8, row * TILE + 8);

// Walkable tiles reachable from a start tile (4 directions).
function reachable(m: SpaceMap, from: { col: number; row: number }) {
  const seen = new Set<string>([`${from.col},${from.row}`]);
  const queue = [from];
  while (queue.length) {
    const { col, row } = queue.shift()!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= m.cols || r >= m.rows || seen.has(`${c},${r}`) || solidAt(m, c, r)) continue;
      seen.add(`${c},${r}`);
      queue.push({ col: c, row: r });
    }
  }
  return seen;
}
const tileOf = (p: { x: number; y: number }) => ({ col: Math.floor(p.x / TILE), row: Math.floor(p.y / TILE) });

describe("map data", () => {
  it("uses 16px tiles", () => {
    expect(TILE).toBe(16);
  });

  it.each([["TEAM_MAP", TEAM_MAP, 72, 36], ["MY_ROOM", MY_ROOM, 28, 18]] as const)("%s has the declared size", (_n, m, cols, rows) => {
    expect(m.cols).toBe(cols);
    expect(m.rows).toBe(rows);
    expect(m.grid).toHaveLength(rows);
    for (const row of m.grid) expect(row).toHaveLength(cols);
  });

  it("MY_ROOM has a computer, a team board and a door", () => {
    expect(count(MY_ROOM, "C")).toBeGreaterThan(0);
    expect(count(MY_ROOM, "T")).toBeGreaterThan(0);
    expect(count(MY_ROOM, "X")).toBeGreaterThan(0);
    expect(MY_ROOM.seats).toEqual([]);
  });

  it("TEAM_MAP has 12 partitioned workstations, a meeting room, a board zone and an entrance", () => {
    expect(TEAM_MAP.seats).toHaveLength(12);
    expect(count(TEAM_MAP, "D")).toBe(12 * 10); // desk top is 5 wide x 2 tall per workstation
    for (const ch of ["M", "B", "E", "G", "P"]) expect(count(TEAM_MAP, ch)).toBeGreaterThan(0);
  });
});

describe("isSolid", () => {
  it("is true for walls, partitions, desks, glass, objects and anything outside the map", () => {
    expect(isSolid(TEAM_MAP, 5, 5)).toBe(true); // corner wall
    expect(solidAt(TEAM_MAP, 17, 6)).toBe(true); // side partition of the first workstation
    expect(solidAt(TEAM_MAP, 19, 6)).toBe(true); // its desk
    expect(solidAt(TEAM_MAP, 1, 5)).toBe(true); // glass wall of the meeting room
    expect(solidAt(TEAM_MAP, 6, 6)).toBe(true); // meeting table
    expect(solidAt(MY_ROOM, 4, 3)).toBe(true); // computer
    expect(isSolid(TEAM_MAP, -1, 100)).toBe(true);
    expect(isSolid(TEAM_MAP, 100, TEAM_MAP.rows * TILE + 1)).toBe(true);
  });
  it("is false on open floor, zone markers and the meeting room door gap", () => {
    expect(solidAt(TEAM_MAP, 30, 22)).toBe(false);
    expect(solidAt(TEAM_MAP, 3, 5)).toBe(false); // meeting room floor
    expect(solidAt(TEAM_MAP, 20, 2)).toBe(false); // board zone
    expect(solidAt(TEAM_MAP, 7, 10)).toBe(false); // door gap
  });
});

describe("seats", () => {
  it("are 12 distinct, walkable spots in reading order (top row left to right, then the lower row)", () => {
    const seats = deskSpots(TEAM_MAP);
    expect(seats).toHaveLength(12);
    expect(new Set(seats.map((s) => `${s.x},${s.y}`)).size).toBe(12);
    for (const s of seats) expect(isSolid(TEAM_MAP, s.x, s.y)).toBe(false);
    expect(seats[0].y).toBe(seats[5].y);
    expect(seats[6].y).toBe(seats[11].y);
    expect(seats[6].y).toBeGreaterThan(seats[0].y);
    for (let i = 1; i < 6; i++) expect(seats[i].x).toBeGreaterThan(seats[i - 1].x);
  });

  it("can all be reached from the entrance, as can the meeting room, the board and the entrance", () => {
    const spawn = tileOf(spawnPoint(TEAM_MAP));
    const reach = reachable(TEAM_MAP, spawn);
    for (const s of TEAM_MAP.seats) expect(reach.has(`${tileOf(s).col},${tileOf(s).row}`)).toBe(true);
    expect(reach.has("7,9")).toBe(true); // inside the meeting room
    expect(reach.has("20,2")).toBe(true); // in front of the wall screens
  });

  it("are not reachable by walking through a partition", () => {
    // the cell behind the first workstation's back partition is outside; its seat is only open to the front
    const seat = tileOf(TEAM_MAP.seats[0]);
    expect(solidAt(TEAM_MAP, seat.col, seat.row - 2)).toBe(true); // desk top above the chair
  });
});

describe("interactTarget", () => {
  it("finds the meeting room from inside and from just outside its door", () => {
    expect(interactTarget(TEAM_MAP, center(3, 5))).toBe("meeting");
    expect(interactTarget(TEAM_MAP, center(7, 11))).toBe("meeting");
  });
  it("finds the board zone and the entrance", () => {
    expect(interactTarget(TEAM_MAP, center(20, 2))).toBe("board");
    const spawn = spawnPoint(TEAM_MAP);
    expect(interactTarget(TEAM_MAP, spawn)).toBe("entrance");
  });
  it("returns null far from everything", () => {
    expect(interactTarget(TEAM_MAP, center(40, 25))).toBeNull();
  });
  it("finds the objects in my room when next to them", () => {
    expect(interactTarget(MY_ROOM, center(6, 5))).toBe("computer");
    expect(interactTarget(MY_ROOM, center(21, 5))).toBe("teamboard");
    expect(interactTarget(MY_ROOM, center(13, 16))).toBe("door");
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

describe("statusSpot", () => {
  const tile = (p: { x: number; y: number }) => ({ col: Math.floor(p.x / TILE), row: Math.floor(p.y / TILE) });
  it("working goes to the member's own chair", () => {
    expect(statusSpot(TEAM_MAP, "working", 3)).toEqual({ ...TEAM_MAP.seats[3], dir: "up" });
  });
  it("working without a desk goes nowhere", () => {
    expect(statusSpot(TEAM_MAP, "working", null)).toBeNull();
  });
  it("meeting lands on a walkable tile inside the meeting room", () => {
    const { col, row } = tile(statusSpot(TEAM_MAP, "meeting", null)!);
    expect(TEAM_MAP.grid[row][col]).toBe("M");
    expect(solidAt(TEAM_MAP, col, row)).toBe(false);
  });
  it("away and meal land on the rest zone", () => {
    for (const s of ["away", "meal"] as const) {
      const { col, row } = tile(statusSpot(TEAM_MAP, s, null)!);
      expect(TEAM_MAP.grid[row][col]).toBe("R");
    }
  });
  it("my room has no zones", () => {
    expect(statusSpot(MY_ROOM, "meeting", null)).toBeNull();
  });
});
