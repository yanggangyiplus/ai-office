import * as Ably from "ably";
import type { ChatMessage, PeerState, Position, Self, Transport } from "./types";

type PresenceData = { self: Self; pos: Position };

// Ably-backed transport. The server scopes each browser's token to the teams it belongs to (/api/realtime/token),
// so a non-member cannot even subscribe. Self.id must be the userId: one character per account, newest tab wins.
export class AblyTransport implements Transport {
  private client: Ably.Realtime | null = null;
  private channel: Ably.RealtimeChannel | null = null;
  private self: Self | null = null;
  private pos: Position = { x: 0, y: 0, dir: "down" };
  private peers = new Map<string, PeerState>();
  private moveCbs = new Set<(id: string, p: Position) => void>();
  private peerCbs = new Set<(p: PeerState[]) => void>();
  private chatCbs = new Set<(m: ChatMessage) => void>();
  private kickedCbs = new Set<() => void>();

  constructor(private teamId: string) {}

  private emitPeers() {
    const list = [...this.peers.values()];
    this.peerCbs.forEach((cb) => cb(list));
  }

  private onPresence(m: Ably.PresenceMessage) {
    const me = this.self!;
    const data = m.data as PresenceData | undefined;
    if (m.clientId === me.userId) {
      // Same account entered from another connection: that one is newer, so this tab steps aside.
      if (m.action === "enter" && m.connectionId !== this.client!.connection.id) {
        this.kickedCbs.forEach((cb) => cb());
        void this.close();
      }
      return;
    }
    if (m.action === "leave" || m.action === "absent") {
      if (this.peers.delete(m.clientId)) this.emitPeers();
    } else if (data) {
      this.peers.set(m.clientId, { ...data.self, id: m.clientId, ...data.pos });
      this.emitPeers();
    }
  }

  async connect(self: Self, start: Position): Promise<void> {
    this.self = self;
    this.pos = start;
    this.client = new Ably.Realtime({ authUrl: "/api/realtime/token", authMethod: "POST" });
    const channel = this.client.channels.get(`team:${this.teamId}`);
    this.channel = channel;

    await channel.subscribe("move", (m) => {
      if (m.connectionId === this.client?.connection.id) return;
      const d = m.data as { id: string; pos: Position };
      const p = this.peers.get(d.id);
      if (p) this.peers.set(d.id, { ...p, ...d.pos });
      this.moveCbs.forEach((cb) => cb(d.id, d.pos));
    });
    await channel.subscribe("chat", (m) => {
      this.chatCbs.forEach((cb) => cb(m.data as ChatMessage));
    });
    await channel.presence.subscribe((m) => this.onPresence(m));
    await channel.presence.enter({ self, pos: start } satisfies PresenceData);
    // Everyone already here, at their last known position.
    for (const m of await channel.presence.get()) this.onPresence(m);
  }

  publishMove(p: Position) {
    this.pos = p;
    void this.channel?.publish("move", { id: this.self!.id, pos: p }).catch(() => {});
  }

  async setPresence(p: Position) {
    this.pos = p;
    await this.channel?.presence.update({ self: this.self!, pos: p } satisfies PresenceData);
  }

  sendChat() {
    // The server already published the saved message to the channel; nothing to relay from the browser.
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
  onKicked(cb: () => void) {
    this.kickedCbs.add(cb);
    return () => this.kickedCbs.delete(cb);
  }

  async close() {
    const client = this.client;
    this.client = null;
    try {
      await this.channel?.presence.leave();
    } catch {}
    client?.close();
  }
}
