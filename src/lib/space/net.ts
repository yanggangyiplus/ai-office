const MOVE_INTERVAL_MS = 200; // about 5 sends a second while walking
const PRESENCE_INTERVAL_MS = 5000;

// Send a position only if the player really moved and the last send was long enough ago.
export function shouldPublishMove(
  last: { at: number; x: number; y: number } | null,
  now: number,
  pos: { x: number; y: number },
): boolean {
  if (!last) return true;
  return now - last.at >= MOVE_INTERVAL_MS && (pos.x !== last.x || pos.y !== last.y);
}

// Update the "last known position" late joiners read: when the player stops, and every 5s while walking.
export function shouldRefreshPresence(lastAt: number, now: number, moving: boolean, justStopped: boolean): boolean {
  if (justStopped) return true;
  return moving && now - lastAt >= PRESENCE_INTERVAL_MS;
}
