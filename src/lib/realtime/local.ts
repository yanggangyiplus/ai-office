import type { ChatMessage, PeerState, Position, Self, Transport } from "./types";

type Wire =
  | { t: "hello"; self: Self; pos: Position } // a newcomer announces itself; everyone answers with "here"
  | { t: "here"; self: Self; pos: Position }
  | { t: "presence"; self: Self; pos: Position }
  | { t: "move"; id: string; pos: Position }
  | { t: "chat"; m: ChatMessage }
  | { t: "leave"; id: string };

// Dev fallback for when there is no Ably key: tabs of one browser talk over a BroadcastChannel.
// Each tab is its own character (Self.id is per tab), so two tabs can be used to try walking and chat.
export class LocalTransport implements Transport {
  private ch: BroadcastChannel | null = null;
  private self: Self | null = null;
  private pos: Position = { x: 0, y: 0, dir: "down" };
  private peers = new Map<string, PeerState>();
  private moveCbs = new Set<(id: string, p: Position) => void>();
  private peerCbs = new Set<(p: PeerState[]) => void>();
  private chatCbs = new Set<(m: ChatMessage) => void>();

  constructor(private teamId: string) {}

  async connect(self: Self, start: Position): Promise<void> {
    this.self = self;
    this.pos = start;
    this.ch = new BroadcastChannel(`team:${this.teamId}`);
    this.ch.onmessage = (e: MessageEvent<Wire>) => this.receive(e.data);
    this.send({ t: "hello", self, pos: start });
  }

  private send(w: Wire) {
    this.ch?.postMessage(w);
  }

  private emitPeers() {
    const list = [...this.peers.values()];
    this.peerCbs.forEach((cb) => cb(list));
  }

  private receive(w: Wire) {
    if (!this.self) return;
    switch (w.t) {
      case "hello":
        this.peers.set(w.self.id, { ...w.self, ...w.pos });
        this.send({ t: "here", self: this.self, pos: this.pos }); // current spot, not the starting one
        this.emitPeers();
        break;
      case "here":
      case "presence":
        this.peers.set(w.self.id, { ...w.self, ...w.pos });
        this.emitPeers();
        break;
      case "move": {
        const p = this.peers.get(w.id);
        if (p) this.peers.set(w.id, { ...p, ...w.pos });
        this.moveCbs.forEach((cb) => cb(w.id, w.pos));
        break;
      }
      case "chat":
        this.chatCbs.forEach((cb) => cb(w.m));
        break;
      case "leave":
        if (this.peers.delete(w.id)) this.emitPeers();
        break;
    }
  }

  publishMove(p: Position) {
    this.pos = p;
    this.send({ t: "move", id: this.self!.id, pos: p });
  }

  async setPresence(p: Position) {
    this.pos = p;
    this.send({ t: "presence", self: this.self!, pos: p });
  }

  sendChat(m: ChatMessage) {
    this.send({ t: "chat", m });
  }

  onMove(cb: (id: string, p: Position) => void) {
    this.moveCbs.add(cb);
    return () => this.moveCbs.delete(cb);
  }
  onPeers(cb: (p: PeerState[]) => void) {
    this.peerCbs.add(cb);
    return () => this.peerCbs.delete(cb);
  }
  onChat(cb: (m: ChatMessage) => void) {
    this.chatCbs.add(cb);
    return () => this.chatCbs.delete(cb);
  }
  onKicked() {
    return () => {}; // one tab = one character here, so nobody is ever kicked
  }

  async close() {
    if (this.self) this.send({ t: "leave", id: this.self.id });
    this.ch?.close();
    this.ch = null;
  }
}
