import { TILE } from "./map";

// The canvas is always drawn at this size and scaled by CSS; the camera decides which part of the map shows.
export const VIEW_W = 1280;
export const VIEW_H = 720;
export type Zoom = "near" | "fit";

// screen = (world - camera) * scale. x and y can be negative when the map is smaller than the view (it is centred).
export function cameraFor(
  map: { cols: number; rows: number },
  zoom: Zoom,
  player: { x: number; y: number },
): { scale: number; x: number; y: number } {
  const mapW = map.cols * TILE;
  const mapH = map.rows * TILE;
  const scale = zoom === "fit" ? Math.min(VIEW_W / mapW, VIEW_H / mapH) : 2;
  const vw = VIEW_W / scale;
  const vh = VIEW_H / scale;
  const axis = (p: number, view: number, size: number) =>
    zoom === "fit" || size <= view ? (size - view) / 2 : Math.min(Math.max(p - view / 2, 0), size - view);
  return { scale, x: axis(player.x, vw, mapW), y: axis(player.y, vh, mapH) };
}
