import type { Position } from "../realtime/types";

export const TILE = 32;

// One character per tile. # wall, . floor, D desk, M meeting zone, B board zone, E entrance,
// C computer, T team board, X door. Walls, desks and C/T/X block walking; zones and floor do not.
export type SpaceMap = { cols: number; rows: number; grid: string[] };

const SOLID = new Set(["#", "D", "C", "T", "X"]);
const make = (grid: string[]): SpaceMap => ({ cols: grid[0].length, rows: grid.length, grid });

export const TEAM_MAP: SpaceMap = make([
  "##############################",
  "#............................#",
  "#.MMMM.............BBBBBB....#",
  "#.MMMM.............BBBBBB....#",
  "#............................#",
  "#............................#",
  "#..D.D.D.D.D.D...............#",
  "#............................#",
  "#............................#",
  "#..D.D.D.D.D.D...............#",
  "#............................#",
  "#............................#",
  "#............................#",
  "#............................#",
  "#............................#",
  "#............................#",
  "#............................#",
  "#............................#",
  "#............EE..............#",
  "##############################",
]);

export const MY_ROOM: SpaceMap = make([
  "############",
  "#..........#",
  "#.C......T.#",
  "#..........#",
  "#..........#",
  "#..........#",
  "#..........#",
  "#....X.....#",
  "############",
]);

const tileAt = (map: SpaceMap, col: number, row: number) =>
  col < 0 || row < 0 || col >= map.cols || row >= map.rows ? "#" : map.grid[row][col];

export function isSolid(map: SpaceMap, px: number, py: number): boolean {
  return SOLID.has(tileAt(map, Math.floor(px / TILE), Math.floor(py / TILE)));
}

// The tile just below each desk, in the middle of the tile, is where that desk's owner sits.
export function deskSpots(map: SpaceMap): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = [];
  map.grid.forEach((line, row) =>
    [...line].forEach((ch, col) => {
      if (ch === "D") spots.push({ x: col * TILE + TILE / 2, y: (row + 1) * TILE + TILE / 2 });
    }),
  );
  return spots;
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

export type Interactable = "meeting" | "board" | "computer" | "teamboard" | "door";
const TARGETS: Record<string, Interactable> = { M: "meeting", B: "board", C: "computer", T: "teamboard", X: "door" };

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
