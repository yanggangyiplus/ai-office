import type { Position } from "../realtime/types";

export const TILE = 16;

// One character per 16px tile.
//   # wall   G glass wall   P partition / furniture   D desk top   . floor
//   M meeting room floor   B in front of the wall screens   E entrance
//   C computer   T team board   X door   (the last three are only in my room)
// Walls, glass, partitions, desks and C/T/X block walking; floor and the M/B/E zones do not.
export type SpaceMap = { cols: number; rows: number; grid: string[]; seats: { x: number; y: number }[] };

const SOLID = new Set(["#", "G", "P", "D", "C", "T", "X"]);
type Rect = (c0: number, r0: number, c1: number, r1: number, ch: string) => void; // inclusive tile ranges

function build(cols: number, rows: number, paint: (rect: Rect) => void): string[] {
  const g = Array.from({ length: rows }, () => Array<string>(cols).fill("."));
  paint((c0, r0, c1, r1, ch) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ch;
  });
  return g.map((row) => row.join(""));
}

// Workstations: 6 per row, 7 tiles wide and 5 tall, one every 8 tiles. The scene draws them from the same numbers.
export const STATION_COLS = [17, 25, 33, 41, 49, 57];
export const STATION_ROWS = [5, 14];

export const TEAM_MAP: SpaceMap = {
  cols: 72,
  rows: 36,
  grid: build(72, 36, (rect) => {
    rect(0, 0, 71, 1, "#"); rect(0, 34, 71, 35, "#"); rect(0, 0, 0, 35, "#"); rect(71, 0, 71, 35, "#");
    // glass meeting room (door gap in the bottom wall, tiles 6..8)
    rect(1, 3, 13, 3, "G"); rect(1, 3, 1, 10, "G"); rect(13, 3, 13, 10, "G");
    rect(1, 10, 5, 10, "G"); rect(9, 10, 13, 10, "G");
    rect(2, 4, 12, 9, "M"); rect(6, 10, 8, 10, "M"); rect(4, 6, 11, 7, "P"); // floor, door gap, table
    rect(16, 2, 36, 2, "B"); // standing here you are in front of the wall screens
    for (const r0 of STATION_ROWS) {
      for (const c0 of STATION_COLS) {
        rect(c0, r0, c0 + 6, r0, "P"); // back partition
        rect(c0, r0, c0, r0 + 4, "P"); rect(c0 + 6, r0, c0 + 6, r0 + 4, "P"); // side partitions
        rect(c0 + 1, r0 + 1, c0 + 5, r0 + 2, "D"); // desk top; the chair area below it stays open
      }
    }
    // furniture along the left side and the bottom
    rect(2, 15, 5, 16, "P"); rect(2, 18, 5, 19, "P"); // shelves
    rect(7, 15, 8, 16, "P"); rect(10, 15, 10, 16, "P"); rect(14, 15, 14, 16, "P"); // printer, water, plant
    rect(2, 27, 2, 28, "P"); rect(14, 27, 14, 28, "P"); rect(40, 27, 40, 28, "P"); rect(66, 27, 66, 28, "P"); // plants
    rect(22, 26, 27, 27, "P"); rect(23, 29, 26, 30, "P"); rect(31, 26, 32, 28, "P"); // sofa, table, coffee machine
    rect(34, 32, 37, 33, "E"); // entrance
  }),
  // the tile just below each desk is where that person's chair is
  seats: STATION_ROWS.flatMap((r0) => STATION_COLS.map((c0) => ({ x: (c0 + 3) * TILE + TILE / 2, y: (r0 + 3) * TILE + TILE / 2 }))),
};

export const MY_ROOM: SpaceMap = {
  cols: 28,
  rows: 18,
  grid: build(28, 18, (rect) => {
    rect(0, 0, 27, 1, "#"); rect(0, 17, 27, 17, "#"); rect(0, 0, 0, 17, "#"); rect(27, 0, 27, 17, "#");
    rect(4, 3, 5, 4, "C"); rect(22, 3, 23, 4, "T"); rect(13, 17, 14, 17, "X");
  }),
  seats: [],
};

const tileAt = (map: SpaceMap, col: number, row: number) =>
  col < 0 || row < 0 || col >= map.cols || row >= map.rows ? "#" : map.grid[row][col];

export function isSolid(map: SpaceMap, px: number, py: number): boolean {
  return SOLID.has(tileAt(map, Math.floor(px / TILE), Math.floor(py / TILE)));
}

// One sitting spot per workstation, in reading order (top row left to right, then the lower row).
export function deskSpots(map: SpaceMap): { x: number; y: number }[] {
  return map.seats;
}

export function spawnPoint(map: SpaceMap): Position {
  for (let row = 0; row < map.rows; row++) {
    const col = map.grid[row].indexOf("E");
    if (col >= 0) return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2, dir: "up" };
  }
  // No entrance (my room): the walkable tile nearest the middle.
  let best = { col: 1, row: 1, d: Infinity };
  for (let row = 0; row < map.rows; row++)
    for (let col = 0; col < map.cols; col++) {
      if (SOLID.has(tileAt(map, col, row))) continue;
      const d = Math.hypot(col - map.cols / 2, row - map.rows / 2);
      if (d < best.d) best = { col, row, d };
    }
  return { x: best.col * TILE + TILE / 2, y: best.row * TILE + TILE / 2, dir: "down" };
}

export type Interactable = "meeting" | "board" | "computer" | "teamboard" | "door" | "entrance";
const TARGETS: Record<string, Interactable> = { M: "meeting", B: "board", C: "computer", T: "teamboard", X: "door", E: "entrance" };

// What the player could use right now: the nearest zone/object within one tile (standing on a zone counts).
export function interactTarget(map: SpaceMap, pos: { x: number; y: number }): Interactable | null {
  const col = Math.floor(pos.x / TILE);
  const row = Math.floor(pos.y / TILE);
  let best: { t: Interactable; d: number } | null = null;
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const t = TARGETS[tileAt(map, col + dc, row + dr)];
      const d = Math.abs(dr) + Math.abs(dc);
      if (t && (!best || d < best.d)) best = { t, d };
    }
  return best?.t ?? null;
}
