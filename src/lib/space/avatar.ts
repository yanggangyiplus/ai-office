import type { Dir } from "../realtime/types";

// 8x8 pixel character shared by the HTML avatar and the canvas. Colors come from a hash of the user id.
const HAIR = ["#3a2a1a", "#c2410c", "#facc15", "#1e293b", "#7c3aed"];
const SHIRT = ["#ef476f", "#118ab2", "#06d6a0", "#ffd166", "#8338ec", "#fb8500"];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function avatarColors(id: string): Record<string, string> {
  const h = hash(id);
  return {
    H: HAIR[h % HAIR.length],
    S: "#f1c27d",
    E: "#1d1b2e",
    T: SHIRT[(h >>> 3) % SHIRT.length], // >>> keeps the index non-negative; >> could go negative and leave the shirt unpainted
  };
}

// rows of the sprite: H hair, S skin, E eye, T shirt, . empty
const FRONT = ["..HHHH..", ".HHHHHH.", ".HSSSSH.", ".SESSES.", "..SSSS..", ".TTTTTT.", "TTTTTTTT", ".TT..TT."];
const FRONT_STEP = ["..HHHH..", ".HHHHHH.", ".HSSSSH.", ".SESSES.", "..SSSS..", ".TTTTTT.", "TTTTTTTT", ".T....T."];

// The sprite for a facing and walk frame: back of the head going up, one eye in profile going left/right, legs alternate.
export function avatarSprite(dir: Dir, frame: 0 | 1 = 0): string[] {
  const rows = [...(frame ? FRONT_STEP : FRONT)];
  if (dir === "up") {
    rows[2] = ".HHHHHH.";
    rows[3] = ".HHHHHH.";
    rows[4] = "..HHHH..";
  } else if (dir === "left") rows[3] = ".SESSSS.";
  else if (dir === "right") rows[3] = ".SSSSES.";
  return rows;
}
