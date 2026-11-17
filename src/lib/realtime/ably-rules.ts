import type { PeerState, Position, Self } from "./types";

// Pure rules behind AblyTransport, kept apart so they can be unit tested without a network.

// Chat the server publishes uses the API key, so it has no clientId. A browser always publishes as its user
// (the token fixes clientId), so a "chat" event with a clientId is a member trying to forge a message: drop it.
export function isServerMessage(m: { clientId?: string | null }): boolean {
  return !m.clientId;
}

export type PeerEntry = PeerState & { connectionId: string };
export type PresenceEvent = {
  action: string;
  clientId: string;
  connectionId: string;
  data?: { self: Self; pos: Position };
};

// Applies one presence event to the roster; returns whether the roster changed. Peers are keyed by account
// (clientId), but a leave only counts if it comes from the connection we currently show: when a user opens a
// new tab, the old tab's leave must not remove the new one.
export function applyPresence(peers: Map<string, PeerEntry>, ev: PresenceEvent, me: { userId: string }): boolean {
  if (ev.clientId === me.userId) return false;
  if (ev.action === "leave" || ev.action === "absent") {
    const current = peers.get(ev.clientId);
    if (!current || current.connectionId !== ev.connectionId) return false;
    peers.delete(ev.clientId);
    return true;
  }
  if (!ev.data) return false;
  peers.set(ev.clientId, { ...ev.data.self, id: ev.clientId, ...ev.data.pos, connectionId: ev.connectionId });
  return true;
}
