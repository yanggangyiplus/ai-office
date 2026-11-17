import type { Status } from "../attendance";
import { label, plate, rect, roleTags } from "./draw";
import { STATION_COLS, STATION_ROWS, TEAM_MAP, MY_ROOM, TILE } from "./map";

// Everything here is drawn from the same tile numbers as map.ts, so what you see is what blocks you.

export type DeskState = "off" | Status;
export type DeskOwner = { desk: number; userId: string; name: string; roles: string[]; me: boolean; state: DeskState };
export type TeamSceneOpts = { owners: DeskOwner[]; teamPercent: number; meetingText: string };

const FLOOR = "#e8ebf0";
const GRID = "#dfe3e9";
const WALL = "#cfd6de";
const WALL_EDGE = "#b5bdc7";
const STATE_COLOR: Record<DeskState, string> = {
  off: "#b9c2cc", working: "#5fb37c", meeting: "#6a8fd8", away: "#d9a441", meal: "#d9a441",
};

function floor(ctx: CanvasRenderingContext2D, w: number, h: number) {
  rect(ctx, 0, 0, w, h, FLOOR);
  for (let x = 0; x <= w; x += 32) rect(ctx, x, 0, 1, h, GRID);
  for (let y = 0; y <= h; y += 32) rect(ctx, 0, y, w, 1, GRID);
}

function walls(ctx: CanvasRenderingContext2D, w: number, h: number, bottomRows: number) {
  rect(ctx, 0, 0, w, 30, WALL); rect(ctx, 0, 28, w, 2, WALL_EDGE); rect(ctx, 0, 0, w, 2, "#e1e6ec");
  rect(ctx, 0, 0, TILE, h, WALL); rect(ctx, w - TILE, 0, TILE, h, WALL);
  rect(ctx, TILE - 2, 30, 2, h, WALL_EDGE); rect(ctx, w - TILE, 30, 2, h, WALL_EDGE);
  rect(ctx, 0, h - bottomRows * TILE, w, bottomRows * TILE, WALL); rect(ctx, 0, h - bottomRows * TILE, w, 2, WALL_EDGE);
}

function windows(ctx: CanvasRenderingContext2D, w: number) {
  for (let x = 24; x < w - 60; x += 76) {
    rect(ctx, x, 8, 52, 14, "#dbe9f7");
    rect(ctx, x, 8, 52, 1, "#b9c4d0"); rect(ctx, x, 21, 52, 1, "#b9c4d0"); rect(ctx, x, 8, 1, 14, "#b9c4d0"); rect(ctx, x + 51, 8, 1, 14, "#b9c4d0"); rect(ctx, x + 25, 8, 2, 14, "#b9c4d0");
  }
}

function screen(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, body: () => void) {
  rect(ctx, x, y, w, h, "#2b323a"); rect(ctx, x, y, w, 1, "#46505b");
  label(ctx, title, x + 5, y + 2, "#9fb3c8");
  body();
}

function plant(ctx: CanvasRenderingContext2D, x: number, y: number) { // 16 x 32
  rect(ctx, x + 3, y + 21, 10, 9, "#b9c2cc"); rect(ctx, x + 3, y + 21, 10, 2, "#d3d9e0");
  rect(ctx, x, y + 10, 16, 12, "#5f9071"); rect(ctx, x + 2, y + 4, 12, 8, "#79a98a"); rect(ctx, x + 5, y, 6, 5, "#93bfa1");
}

function station(ctx: CanvasRenderingContext2D, x: number, y: number, o: DeskOwner | undefined, withPlant: boolean) {
  if (o?.me) {
    rect(ctx, x - 6, y - 8, 124, 94, "rgba(74,123,208,0.10)");
    for (const [cx, cy] of [[x - 6, y - 8], [x + 112, y - 8], [x - 6, y + 84], [x + 112, y + 84]]) {
      rect(ctx, cx, cy, 6, 2, "#4a7bd0"); rect(ctx, cx, cy, 2, 6, "#4a7bd0");
    }
  }
  const pt = "#aeb7c1", hi = "#cdd3da", lo = "#97a1ad";
  // desk top, monitor, keyboard, mug, papers
  rect(ctx, x + 6, y + 6, 100, 42, "#f3f5f8"); rect(ctx, x + 6, y + 6, 100, 1, "#ffffff"); rect(ctx, x + 6, y + 46, 100, 2, "#c0c8d1");
  rect(ctx, x + 41, y + 10, 30, 18, "#2b323a"); rect(ctx, x + 43, y + 12, 26, 13, o?.me ? "#7fa6d6" : "#6b93c4");
  rect(ctx, x + 45, y + 14, 12, 1, "#c9dbf2"); rect(ctx, x + 45, y + 17, 18, 1, "#a9c4e6"); rect(ctx, x + 45, y + 20, 9, 1, "#a9c4e6");
  rect(ctx, x + 54, y + 28, 4, 3, "#59636d"); rect(ctx, x + 49, y + 31, 14, 2, "#59636d");
  rect(ctx, x + 43, y + 36, 26, 3, "#c9d0d8"); rect(ctx, x + 80, y + 38, 5, 4, "#9aa4b0");
  rect(ctx, x + 86, y + 12, 5, 6, "#ffffff"); rect(ctx, x + 86, y + 12, 5, 1, "#cfd6dd"); rect(ctx, x + 91, y + 14, 2, 3, "#cfd6dd");
  rect(ctx, x + 12, y + 12, 12, 14, "#ffffff"); rect(ctx, x + 12, y + 12, 12, 1, "#cfd6dd"); rect(ctx, x + 14, y + 16, 8, 1, "#cfd6dd"); rect(ctx, x + 14, y + 19, 8, 1, "#cfd6dd");
  if (withPlant) { rect(ctx, x + 92, y + 24, 6, 5, "#b9c2cc"); rect(ctx, x + 91, y + 19, 8, 6, "#6b9a7a"); rect(ctx, x + 93, y + 17, 4, 3, "#86b394"); }
  // partitions (back and both sides) on top of the desk
  rect(ctx, x, y, 112, 6, pt); rect(ctx, x, y, 112, 2, hi); rect(ctx, x, y + 4, 112, 2, lo);
  rect(ctx, x, y, 6, 80, pt); rect(ctx, x, y, 2, 80, hi); rect(ctx, x + 4, y, 2, 80, lo);
  rect(ctx, x + 106, y, 6, 80, pt); rect(ctx, x + 106, y, 2, 80, hi); rect(ctx, x + 110, y, 2, 80, lo);
  // chair
  rect(ctx, x + 44, y + 50, 24, 8, "#4a5560"); rect(ctx, x + 44, y + 50, 24, 2, "#5d6874");
  rect(ctx, x + 47, y + 58, 18, 10, "#3d4752"); rect(ctx, x + 47, y + 66, 18, 2, "#2f3740");
  rect(ctx, x + 54, y + 68, 4, 5, "#59636d"); rect(ctx, x + 48, y + 73, 16, 2, "#59636d");
  // who sits here
  if (o) {
    roleTags(ctx, o.roles, x + 56, y - 23);
    plate(ctx, o.name, x + 56, y - 10, o.me);
    rect(ctx, x + 100, y - 9, 5, 5, STATE_COLOR[o.state]);
  } else {
    plate(ctx, "빈 자리", x + 56, y - 10);
  }
}

export function drawTeamScene(ctx: CanvasRenderingContext2D, o: TeamSceneOpts) {
  const W = TEAM_MAP.cols * TILE;
  const H = TEAM_MAP.rows * TILE;
  floor(ctx, W, H);
  walls(ctx, W, H, 2);
  windows(ctx, W);

  // wall screens: team progress and this week's meetings
  screen(ctx, 262, 3, 168, 25, "팀 진행률", () => {
    label(ctx, `${o.teamPercent}%`, 262 + 162, 5, "#ffffff", "right");
    rect(ctx, 267, 18, 158, 5, "#46505b"); rect(ctx, 267, 18, Math.round(158 * Math.min(100, o.teamPercent) / 100), 5, "#6ea0f0");
  });
  screen(ctx, 440, 3, 150, 25, "회의 · 이번 주", () => label(ctx, o.meetingText, 445, 15, "#ffffff"));

  // meeting room (glass)
  rect(ctx, 16, 48, 208, 128, "#eef1f5");
  for (let x = 16; x < 224; x += 8) rect(ctx, x, 48, 1, 128, "#e5eaf0");
  rect(ctx, 64, 50, 128, 5, "#2b323a"); rect(ctx, 68, 51, 120, 3, "#7fa6d6"); // wall display
  rect(ctx, 64, 96, 128, 32, "#b8c0ca"); rect(ctx, 64, 96, 128, 2, "#d3d9e0"); rect(ctx, 64, 126, 128, 2, "#9aa4b0");
  rect(ctx, 70, 102, 28, 4, "#a2abb6"); rect(ctx, 124, 104, 24, 12, "#c6ccd4");
  for (let i = 0; i < 4; i++) {
    const cx = 76 + i * 28;
    rect(ctx, cx, 84, 14, 9, "#4a5560"); rect(ctx, cx, 84, 14, 2, "#5d6874");
    rect(ctx, cx, 131, 14, 9, "#4a5560"); rect(ctx, cx, 138, 14, 2, "#3d4752");
  }
  rect(ctx, 48, 104, 9, 14, "#4a5560"); rect(ctx, 199, 104, 9, 14, "#4a5560");
  const glass = "#9fb3c8";
  rect(ctx, 16, 48, 208, 2, glass); rect(ctx, 16, 48, 2, 128, glass); rect(ctx, 222, 48, 2, 128, glass);
  rect(ctx, 16, 174, 80, 2, glass); rect(ctx, 144, 174, 80, 2, glass); rect(ctx, 94, 170, 2, 6, "#7c93ab"); rect(ctx, 144, 170, 2, 6, "#7c93ab");
  plate(ctx, "회의실", 44, 41);

  // workstations
  const byDesk = new Map(o.owners.map((x) => [x.desk, x]));
  let i = 0;
  for (const r0 of STATION_ROWS) for (const c0 of STATION_COLS) {
    station(ctx, c0 * TILE, r0 * TILE, byDesk.get(i), i % 2 === 0);
    i++;
  }

  // shelves, printer, water, plants
  const shelf = (x: number, y: number) => {
    rect(ctx, x, y, 64, 32, "#c8cfd7"); rect(ctx, x, y, 64, 2, "#e1e5ea"); rect(ctx, x, y + 15, 64, 2, "#aeb7c1");
    ([[4, 4, "#8fa4bd"], [16, 4, "#b7c4d4"], [28, 4, "#a1b0c2"], [42, 4, "#c9d3df"], [6, 20, "#a1b0c2"], [20, 20, "#8fa4bd"], [36, 20, "#c9d3df"], [50, 20, "#b7c4d4"]] as const)
      .forEach(([a, b, col]) => rect(ctx, x + a, y + b, 9, 9, col));
  };
  shelf(32, 240); shelf(32, 288);
  label(ctx, "서류함", 64, 228, "#6b7686", "center");
  rect(ctx, 112, 240, 32, 32, "#f3f5f8"); rect(ctx, 112, 240, 32, 2, "#ffffff"); rect(ctx, 116, 248, 24, 8, "#aeb7c1"); rect(ctx, 120, 258, 16, 4, "#ffffff"); rect(ctx, 112, 270, 32, 2, "#c0c8d1");
  label(ctx, "프린터", 128, 276, "#6b7686", "center");
  rect(ctx, 160, 240, 16, 32, "#dfe6ee"); rect(ctx, 162, 243, 12, 8, "#9cc1e8"); rect(ctx, 162, 254, 12, 14, "#cfd8e2"); rect(ctx, 160, 270, 16, 2, "#aeb7c1");
  label(ctx, "정수기", 168, 276, "#6b7686", "center");
  for (const [c, r] of [[14, 15], [2, 27], [14, 27], [40, 27], [66, 27]]) plant(ctx, c * TILE, r * TILE);

  // lounge and coffee
  rect(ctx, 352, 416, 96, 32, "#9aa5b1"); rect(ctx, 352, 416, 96, 6, "#b4bec9"); rect(ctx, 352, 446, 96, 2, "#7f8a97");
  rect(ctx, 352, 416, 10, 32, "#8a95a2"); rect(ctx, 438, 416, 10, 32, "#8a95a2");
  rect(ctx, 368, 464, 64, 32, "#f3f5f8"); rect(ctx, 368, 464, 64, 2, "#ffffff"); rect(ctx, 368, 494, 64, 2, "#c0c8d1"); rect(ctx, 394, 470, 10, 7, "#ffffff");
  label(ctx, "휴게", 400, 500, "#6b7686", "center");
  rect(ctx, 496, 416, 32, 48, "#59636d"); rect(ctx, 499, 419, 26, 10, "#2b323a"); rect(ctx, 506, 432, 12, 16, "#e6eaee"); rect(ctx, 496, 462, 32, 2, "#2f3740");
  label(ctx, "커피", 512, 468, "#6b7686", "center");

  // entrance
  rect(ctx, 544, 520, 64, 16, "#c4cad2"); label(ctx, "입구", 576, 505, "#6b7686", "center");
  rect(ctx, 544, 544, 64, 32, "#eef0f3"); rect(ctx, 544, 544, 2, 32, "#aeb7c1"); rect(ctx, 606, 544, 2, 32, "#aeb7c1"); rect(ctx, 575, 544, 2, 32, "#c4cad2");
}

export function drawRoomScene(ctx: CanvasRenderingContext2D) {
  const W = MY_ROOM.cols * TILE;
  const H = MY_ROOM.rows * TILE;
  floor(ctx, W, H);
  walls(ctx, W, H, 1);
  windows(ctx, W);
  rect(ctx, 160, 144, 128, 80, "#dde2e9"); rect(ctx, 160, 144, 128, 2, "#cbd2db"); rect(ctx, 160, 222, 128, 2, "#cbd2db"); // rug
  // computer desk (tiles 4..5 x 3..4)
  rect(ctx, 64, 48, 32, 32, "#f3f5f8"); rect(ctx, 64, 48, 32, 2, "#ffffff"); rect(ctx, 64, 78, 32, 2, "#c0c8d1");
  rect(ctx, 70, 52, 20, 14, "#2b323a"); rect(ctx, 72, 54, 16, 9, "#7fa6d6"); rect(ctx, 78, 66, 4, 3, "#59636d"); rect(ctx, 70, 70, 20, 3, "#c9d0d8");
  plate(ctx, "컴퓨터", 80, 38);
  // team board (tiles 22..23 x 3..4)
  rect(ctx, 352, 48, 32, 32, "#8d6e4a"); rect(ctx, 355, 51, 26, 26, "#fff8e7");
  rect(ctx, 358, 55, 8, 6, "#4a7bd0"); rect(ctx, 369, 55, 8, 6, "#6f9a86"); rect(ctx, 358, 64, 8, 6, "#cf8a4a"); rect(ctx, 369, 64, 8, 6, "#b0728f");
  plate(ctx, "팀 보드", 368, 38);
  // door (tiles 13..14, bottom wall)
  rect(ctx, 208, 272, 32, 16, "#7a4b2a"); rect(ctx, 208, 272, 32, 2, "#9a6a45"); rect(ctx, 232, 279, 3, 3, "#ffd166"); rect(ctx, 223, 272, 2, 16, "#5e3a20");
  plate(ctx, "문", 224, 258);
  plant(ctx, 40, 224); plant(ctx, 392, 224);

  // bookshelf (tiles 9..12 x 2..3)
  rect(ctx, 144, 32, 64, 32, "#a98a63"); rect(ctx, 144, 32, 64, 2, "#c4a47a"); rect(ctx, 144, 62, 64, 2, "#8a6d49");
  for (const sy of [36, 48]) {
    rect(ctx, 147, sy + 9, 58, 2, "#8a6d49");
    ["#4a7bd0", "#cf8a4a", "#6f9a86", "#b0728f", "#d8d2c4", "#4a7bd0", "#6f9a86", "#cf8a4a", "#b0728f", "#d8d2c4", "#4a7bd0"].forEach((c, i) =>
      rect(ctx, 148 + i * 5, sy + (i % 3 === 0 ? 1 : 3), 4, i % 3 === 0 ? 8 : 6, c));
  }
  // wall clock above the door side, and a small frame
  rect(ctx, 234, 8, 14, 14, "#ffffff"); rect(ctx, 234, 8, 14, 2, "#c0c8d1"); rect(ctx, 234, 20, 14, 2, "#c0c8d1"); rect(ctx, 240, 11, 2, 6, "#2b323a"); rect(ctx, 241, 15, 5, 2, "#2b323a");
  // side table with a coffee mug and a lamp (tiles 24..25 x 3..4)
  rect(ctx, 384, 52, 30, 28, "#e8d9c0"); rect(ctx, 384, 52, 30, 2, "#f6ecda"); rect(ctx, 384, 78, 30, 2, "#b9a688");
  rect(ctx, 389, 58, 8, 8, "#ffffff"); rect(ctx, 397, 60, 2, 4, "#ffffff"); rect(ctx, 390, 59, 6, 2, "#8a5a3a"); // mug
  rect(ctx, 404, 64, 3, 12, "#59636d"); rect(ctx, 400, 54, 11, 10, "#ffe9a8"); // lamp
  // sofa with cushions + coffee table (tiles 2..5 x 9..10, 3..4 x 12)
  rect(ctx, 32, 144, 64, 32, "#7d8da3"); rect(ctx, 32, 144, 64, 8, "#96a5b9"); rect(ctx, 32, 144, 6, 32, "#6b7a8f"); rect(ctx, 90, 144, 6, 32, "#6b7a8f");
  rect(ctx, 42, 156, 20, 12, "#8d9db3"); rect(ctx, 66, 156, 20, 12, "#8d9db3"); rect(ctx, 32, 174, 64, 2, "#5a687b");
  rect(ctx, 48, 192, 32, 16, "#d6c3a4"); rect(ctx, 48, 192, 32, 2, "#ebdcc0"); rect(ctx, 48, 206, 32, 2, "#a8967a");
  rect(ctx, 56, 195, 8, 6, "#ffffff"); rect(ctx, 68, 196, 6, 6, "#e6a5a5"); // magazine and cup
  // filing cabinet (tiles 24..25 x 8..10) with a printer on top is overkill: three drawers
  rect(ctx, 384, 128, 32, 48, "#b7c0cb"); rect(ctx, 384, 128, 32, 2, "#d3d9e0");
  for (const dy of [131, 145, 159]) { rect(ctx, 387, dy, 26, 12, "#c9d0d8"); rect(ctx, 396, dy + 4, 8, 3, "#59636d"); }
  // floor lamp (tile 20 x 14..15)
  rect(ctx, 323, 242, 10, 4, "#59636d"); rect(ctx, 327, 232, 2, 12, "#59636d"); rect(ctx, 320, 224, 16, 10, "#ffe9a8"); rect(ctx, 320, 224, 16, 2, "#fff4cf");
  // shoe rack by the door (tiles 16..17 x 15..16)
  rect(ctx, 256, 240, 32, 32, "#c8b79a"); rect(ctx, 256, 240, 32, 2, "#e0d2b8"); rect(ctx, 256, 255, 32, 2, "#a8967a");
  rect(ctx, 259, 246, 8, 5, "#2b323a"); rect(ctx, 270, 246, 8, 5, "#cf8a4a"); rect(ctx, 259, 261, 8, 5, "#4a7bd0"); rect(ctx, 270, 261, 8, 5, "#f3f5f8");
}
