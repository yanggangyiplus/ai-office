import { avatarColors, avatarSprite } from "@/lib/space/avatar";

export function Avatar({ id, size = 64 }: { id: string; size?: number }) {
  const color = avatarColors(id);
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden>
      {avatarSprite("down").flatMap((row, y) =>
        [...row].map((c, x) => (c === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={color[c]} />)),
      )}
    </svg>
  );
}
