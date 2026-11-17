export type Dir = "up" | "down" | "left" | "right";
export type Position = { x: number; y: number; dir: Dir };
// id identifies one connection (a tab in local mode, the user in Ably mode); userId is the account.
export type Self = { id: string; userId: string; name: string };
export type PeerState = Self & Position;
export type ChatMessage = { id: string; userId: string; name: string; body: string; at: number };

// The space code only talks to this; Ably and BroadcastChannel are interchangeable behind it.
export interface Transport {
  connect(self: Self, start: Position): Promise<void>;
  publishMove(p: Position): void; // fire-and-forget, called ~5 times a second while walking
  setPresence(p: Position): Promise<void>; // durable "last known position" for late joiners
  sendChat(m: ChatMessage): void; // delivers a message the server already saved to the other people here
  onMove(cb: (peerId: string, p: Position) => void): () => void;
  onPeers(cb: (peers: PeerState[]) => void): () => void; // everyone else, on every join/leave/update
  onChat(cb: (m: ChatMessage) => void): () => void;
  onKicked(cb: () => void): () => void; // this user connected somewhere else
  close(): Promise<void>;
}
