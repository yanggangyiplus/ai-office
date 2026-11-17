import type { Dir } from "../realtime/types";
import { roleColor } from "../role-meta";

export const FONT = '9px "Galmuri9", "Galmuri11", ui-monospace, monospace';
const INK = "#2b3340";

export const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) => {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
};

export function label(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, col = INK, align: CanvasTextAlign = "left") {
  ctx.font = FONT;
  ctx.textBaseline = "top";
  ctx.textAlign = align;
  ctx.fillStyle = col;
  ctx.fillText(t, x, y);
}

// A small white name plate (blue when it is mine), centred on cx with its top at y.
export function plate(ctx: CanvasRenderingContext2D, t: string, cx: number, y: number, me = false) {
  ctx.font = FONT;
  const w = Math.ceil(ctx.measureText(t).width) + 8;
  const x = Math.round(cx - w / 2);
  const edge = me ? "#3a66b3" : "#cfd6dd";
  rect(ctx, x, y, w, 12, me ? "#4a7bd0" : "#ffffff");
  rect(ctx, x, y, w, 1, edge); rect(ctx, x, y + 11, w, 1, edge); rect(ctx, x, y, 1, 12, edge); rect(ctx, x + w - 1, y, 1, 12, edge);
  label(ctx, t, cx, y + 2, me ? "#ffffff" : INK, "center");
}

// One tag per role (a person can have several), centred on cx with its top at y. Shows at most 3, then "+N".
export function roleTags(ctx: CanvasRenderingContext2D, roles: string[], cx: number, y: number) {
  if (!roles.length) return;
  ctx.font = FONT;
  const shown = roles.slice(0, 3);
  const items = shown.map((n) => ({ n, w: Math.ceil(ctx.measureText(n).width) + 8, col: roleColor(n) }));
  if (roles.length > 3) items.push({ n: `+${roles.length - 3}`, w: 20, col: "#8a8f99" });
  const total = items.reduce((a, i) => a + i.w + 2, -2);
  let x = Math.round(cx - total / 2);
  for (const i of items) {
    rect(ctx, x, y, i.w, 11, i.col);
    rect(ctx, x, y + 10, i.w, 1, "rgba(0,0,0,0.18)");
    label(ctx, i.n, x + i.w / 2, y + 1, "#ffffff", "center");
    x += i.w + 2;
  }
}

const SHIRTS = ["#7c93ab", "#8aa39b", "#a995a8", "#9aa0b8", "#b49a86", "#7e9fa6"];
const HAIRS = ["#2e2a28", "#3b2f2a", "#1f2328", "#4a3b30", "#5a4636"];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const lighten = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.min(255, Math.round(v + (255 - v) * a));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("");
};
const darken = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - a));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("");
};

export function personStyle(id: string, me: boolean) {
  const h = hash(id);
  return { shirt: me ? "#4a7bd0" : SHIRTS[h % SHIRTS.length], hair: HAIRS[(h >>> 3) % HAIRS.length] };
}

// A 14x24px character with its feet at (cx, footY). From behind going up, in profile going sideways, frame 0/1 swaps the legs.
export function drawPerson(ctx: CanvasRenderingContext2D, id: string, cx: number, footY: number, dir: Dir, frame: 0 | 1, me: boolean) {
  const { shirt, hair } = personStyle(id, me);
  const x = Math.round(cx - 6);
  const y = Math.round(footY - 23);
  const skin = "#f0c8a0";
  rect(ctx, x + 1, y + 23, 10, 2, "rgba(0,0,0,0.10)"); // shadow
  const left = frame === 0 ? 6 : 4; // leg lengths swap between frames
  const right = frame === 0 ? 4 : 6;
  rect(ctx, x + 2, y + 17, 3, left, "#3b4450"); rect(ctx, x + 7, y + 17, 3, right, "#3b4450");
  rect(ctx, x + 2, y + 17 + left - 1, 3, 1, "#20262d"); rect(ctx, x + 7, y + 17 + right - 1, 3, 1, "#20262d");
  rect(ctx, x + 1, y + 9, 10, 8, shirt); rect(ctx, x + 1, y + 9, 10, 1, lighten(shirt, 0.25)); rect(ctx, x + 1, y + 16, 10, 1, darken(shirt, 0.2));
  rect(ctx, x - 1, y + 10, 2, 6, darken(shirt, 0.15)); rect(ctx, x + 11, y + 10, 2, 6, darken(shirt, 0.15));
  if (dir === "up") {
    rect(ctx, x + 2, y, 8, 8, hair); rect(ctx, x + 1, y + 2, 1, 4, hair); rect(ctx, x + 10, y + 2, 1, 4, hair); rect(ctx, x + 5, y + 8, 2, 1, skin);
  } else {
    rect(ctx, x + 2, y, 8, 8, skin); rect(ctx, x + 1, y - 1, 10, 3, hair);
    rect(ctx, x + 1, y + 1, 1, 4, hair); rect(ctx, x + 10, y + 1, 1, 4, hair);
    if (dir === "down") { rect(ctx, x + 4, y + 4, 1, 1, "#2a2f36"); rect(ctx, x + 7, y + 4, 1, 1, "#2a2f36"); }
    else if (dir === "left") { rect(ctx, x + 3, y + 4, 1, 1, "#2a2f36"); rect(ctx, x + 2, y + 1, 3, 3, hair); }
    else { rect(ctx, x + 8, y + 4, 1, 1, "#2a2f36"); rect(ctx, x + 7, y + 1, 3, 3, hair); }
  }
}

// Name above a walking character: a dark chip (readable on the light floor).
export function nameTag(ctx: CanvasRenderingContext2D, name: string, cx: number, footY: number) {
  ctx.font = FONT;
  const w = Math.ceil(ctx.measureText(name).width) + 8;
  const x = Math.round(cx - w / 2);
  const y = Math.round(footY - 23 - 15);
  rect(ctx, x, y, w, 12, "rgba(43,51,64,0.9)");
  label(ctx, name, cx, y + 2, "#ffffff", "center");
}

export function drawBubble(ctx: CanvasRenderingContext2D, text: string, cx: number, footY: number) {
  ctx.font = FONT;
  const t = text.length > 28 ? `${text.slice(0, 28)}…` : text;
  const w = Math.ceil(ctx.measureText(t).width) + 12;
  const x = Math.round(cx - w / 2);
  const y = Math.round(footY - 23 - 50);
  rect(ctx, x - 1, y - 1, w + 2, 20, INK);
  rect(ctx, x, y, w, 18, "#ffffff");
  rect(ctx, Math.round(cx) - 2, y + 18, 5, 3, INK); rect(ctx, Math.round(cx) - 1, y + 18, 3, 2, "#ffffff"); // tail
  label(ctx, t, x + 6, y + 4, INK);
}

export function drawHint(ctx: CanvasRenderingContext2D, text: string, cx: number, footY: number) {
  ctx.font = FONT;
  const w = Math.ceil(ctx.measureText(text).width) + 10;
  const x = Math.round(cx - w / 2);
  rect(ctx, x, Math.round(footY) + 5, w, 14, "#4a7bd0");
  label(ctx, text, cx, Math.round(footY) + 8, "#ffffff", "center");
}
