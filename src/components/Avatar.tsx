// 8x8 pixel avatar; shirt and hair colors come from a hash of the user id.
const HAIR = ["#3a2a1a", "#c2410c", "#facc15", "#1e293b", "#7c3aed"];
const SHIRT = ["#ef476f", "#118ab2", "#06d6a0", "#ffd166", "#8338ec", "#fb8500"];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// rows of an 8x8 sprite: H hair, S skin, E eye, T shirt, . empty
const SPRITE = [
  "..HHHH..",
  ".HHHHHH.",
  ".HSSSSH.",
  ".SESSES.",
  "..SSSS..",
  ".TTTTTT.",
  "TTTTTTTT",
  ".TT..TT.",
];

export function Avatar({ id, size = 64 }: { id: string; size?: number }) {
  const h = hash(id);
  const color: Record<string, string> = {
    H: HAIR[h % HAIR.length],
    S: "#f1c27d",
    E: "#1d1b2e",
    T: SHIRT[(h >> 3) % SHIRT.length],
  };
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden>
      {SPRITE.flatMap((row, y) =>
        [...row].map((c, x) => (c === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={color[c]} />)),
      )}
    </svg>
  );
}
