import type { Dir } from "../realtime/types";
import { avatarColors, avatarSprite } from "./avatar";
import { TILE, type SpaceMap } from "./map";

const INK = "#1d1b2e";
const FONT = '12px Galmuri11, Galmuri9, ui-monospace, monospace';

// One 8x8 sprite scaled to `size` px, standing with its feet at (x, y).
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  size: number,
  dir: Dir,
  frame: 0 | 1 = 0,
) {
  const colors = avatarColors(id);
  const px = size / 8;
  ctx.fillStyle = "rgba(0,0,0,0.25)"; // shadow
  ctx.fillRect(x - size * 0.35, y - px * 0.5, size * 0.7, px);
  avatarSprite(dir, frame).forEach((row, ry) =>
    [...row].forEach((c, rx) => {
      if (c === ".") return;
      ctx.fillStyle = colors[c];
      ctx.fillRect(Math.round(x - size / 2 + rx * px), Math.round(y - size + ry * px), Math.ceil(px), Math.ceil(px));
    }),
  );
}

function tile(ctx: CanvasRenderingContext2D, ch: string, col: number, row: number) {
  const x = col * TILE;
  const y = row * TILE;
  const floor = (col + row) % 2 ? "#cfae7e" : "#d9b98a";
  const box = (c: string, ox = 0, oy = 0, w = TILE, h = TILE) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + ox, y + oy, w, h);
  };
  switch (ch) {
    case "#":
      box("#2b2d42");
      box("#3d405b", 0, 0, TILE, 6);
      break;
    case "D": // desk with a monitor
      box(floor);
      box("#8d6e4a", 2, 6, TILE - 4, TILE - 10);
      box("#5c4630", 2, TILE - 6, TILE - 4, 4);
      box("#1d1b2e", 9, 8, 14, 10);
      box("#8ecae6", 11, 10, 10, 6);
      break;
    case "M":
      box("#8ecae6");
      box("#6bb3d6", 0, 0, TILE, 2);
      break;
    case "B":
      box("#ffd166");
      box("#e0b24e", 0, 0, TILE, 2);
      break;
    case "E":
      box(floor);
      box("#adb5bd", 4, 8, TILE - 8, TILE - 16);
      break;
    case "C": // computer
      box(floor);
      box("#495057", 4, 8, TILE - 8, TILE - 12);
      box("#a9e5ff", 7, 11, TILE - 14, 10);
      break;
    case "T": // team board
      box(floor);
      box("#6b4a2b", 2, 2, TILE - 4, TILE - 6);
      box("#fff8e7", 5, 5, TILE - 10, TILE - 12);
      box("#ef476f", 8, 8, 6, 4);
      box("#118ab2", 16, 8, 6, 4);
      break;
    case "X": // door
      box(floor);
      box("#7a4b2a", 6, 2, TILE - 12, TILE - 4);
      box("#ffd166", TILE - 12, TILE / 2, 3, 3);
      break;
    default:
      box(floor);
  }
}

const ZONE_LABEL: Record<string, string> = { M: "회의실", B: "현황판", C: "컴퓨터", T: "팀 보드", X: "문", E: "입구" };

export function drawMap(ctx: CanvasRenderingContext2D, map: SpaceMap) {
  map.grid.forEach((line, row) => [...line].forEach((ch, col) => tile(ctx, ch, col, row)));
  // label each zone/object once, on its first tile
  ctx.font = FONT;
  ctx.textBaseline = "top";
  const seen = new Set<string>();
  map.grid.forEach((line, row) =>
    [...line].forEach((ch, col) => {
      if (!ZONE_LABEL[ch] || seen.has(ch)) return;
      seen.add(ch);
      const label = ZONE_LABEL[ch];
      const w = ctx.measureText(label).width + 8;
      ctx.fillStyle = "rgba(29,27,46,0.8)";
      ctx.fillRect(col * TILE, row * TILE - 14, w, 14);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, col * TILE + 4, row * TILE - 13);
    }),
  );
}

export function drawNameTag(ctx: CanvasRenderingContext2D, name: string, x: number, footY: number, size: number) {
  ctx.font = FONT;
  ctx.textBaseline = "top";
  const w = ctx.measureText(name).width + 8;
  ctx.fillStyle = "rgba(29,27,46,0.85)";
  ctx.fillRect(Math.round(x - w / 2), Math.round(footY - size - 16), Math.ceil(w), 14);
  ctx.fillStyle = "#fff";
  ctx.fillText(name, Math.round(x - w / 2 + 4), Math.round(footY - size - 15));
}

export function drawBubble(ctx: CanvasRenderingContext2D, text: string, x: number, footY: number, size: number) {
  ctx.font = FONT;
  ctx.textBaseline = "top";
  const t = text.length > 28 ? `${text.slice(0, 28)}…` : text;
  const w = ctx.measureText(t).width + 12;
  const bx = Math.round(x - w / 2);
  const by = Math.round(footY - size - 38);
  ctx.fillStyle = INK;
  ctx.fillRect(bx - 2, by - 2, Math.ceil(w) + 4, 22);
  ctx.fillStyle = "#fff8e7";
  ctx.fillRect(bx, by, Math.ceil(w), 18);
  ctx.fillStyle = INK;
  ctx.fillText(t, bx + 6, by + 3);
}

export function drawHint(ctx: CanvasRenderingContext2D, text: string, x: number, footY: number) {
  ctx.font = FONT;
  ctx.textBaseline = "top";
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = "#ef476f";
  ctx.fillRect(Math.round(x - w / 2), Math.round(footY + 4), Math.ceil(w), 16);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, Math.round(x - w / 2 + 5), Math.round(footY + 6));
}
