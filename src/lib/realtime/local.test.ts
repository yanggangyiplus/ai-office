import { afterEach, describe, expect, it } from "vitest";
import { LocalTransport } from "./local";
import type { ChatMessage, PeerState, Position, Self } from "./types";

const pos = (x: number, y: number): Position => ({ x, y, dir: "down" });
const A: Self = { id: "a", userId: "ua", name: "에이" };
const B: Self = { id: "b", userId: "ub", name: "비" };

// BroadcastChannel delivers on later event-loop turns, so poll until the condition holds.
async function until(cond: () => boolean, ms = 1000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 5));
  }
}

const open: LocalTransport[] = [];
function make(teamId: string, self: Self, start: Position) {
  const t = new LocalTransport(teamId);
  open.push(t);
  let peers: PeerState[] = [];
  t.onPeers((p) => (peers = p));
  return { t, self, start, peers: () => peers };
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((t) => t.close()));
});

describe("LocalTransport", () => {
  it("shows a newcomer to the people already there", async () => {
    const a = make("t1", A, pos(10, 10));
    await a.t.connect(a.self, a.start);
    const b = make("t1", B, pos(50, 60));
    await b.t.connect(b.self, b.start);
    await until(() => a.peers().length === 1);
    expect(a.peers()[0]).toMatchObject({ id: "b", name: "비", x: 50, y: 60 });
  });

  it("shows a late joiner where the others currently are, not where they started", async () => {
    const a = make("t1", A, pos(10, 10));
    await a.t.connect(a.self, a.start);
    a.t.publishMove(pos(200, 120));
    const b = make("t1", B, pos(0, 0));
    await b.t.connect(b.self, b.start);
    await until(() => b.peers().length === 1);
    expect(b.peers()[0]).toMatchObject({ id: "a", x: 200, y: 120 });
  });

  it("relays moves to the others", async () => {
    const a = make("t1", A, pos(0, 0));
    const b = make("t1", B, pos(0, 0));
    await a.t.connect(a.self, a.start);
    await b.t.connect(b.self, b.start);
    const seen: [string, Position][] = [];
    b.t.onMove((id, p) => seen.push([id, p]));
    a.t.publishMove({ x: 33, y: 44, dir: "left" });
    await until(() => seen.length === 1);
    expect(seen[0]).toEqual(["a", { x: 33, y: 44, dir: "left" }]);
  });

  it("removes a peer when it closes", async () => {
    const a = make("t1", A, pos(0, 0));
    const b = make("t1", B, pos(0, 0));
    await a.t.connect(a.self, a.start);
    await b.t.connect(b.self, b.start);
    await until(() => a.peers().length === 1);
    await b.t.close();
    await until(() => a.peers().length === 0);
  });

  it("delivers chat to the others", async () => {
    const a = make("t1", A, pos(0, 0));
    const b = make("t1", B, pos(0, 0));
    await a.t.connect(a.self, a.start);
    await b.t.connect(b.self, b.start);
    const got: ChatMessage[] = [];
    b.t.onChat((m) => got.push(m));
    const m: ChatMessage = { id: "m1", userId: "ua", name: "에이", body: "안녕", at: 1 };
    a.t.sendChat(m);
    await until(() => got.length === 1);
    expect(got[0]).toEqual(m);
  });

  it("keeps different teams apart", async () => {
    const a = make("t1", A, pos(0, 0));
    const c = make("t2", B, pos(0, 0));
    await a.t.connect(a.self, a.start);
    await c.t.connect(c.self, c.start);
    await new Promise((r) => setTimeout(r, 60));
    expect(a.peers()).toHaveLength(0);
    expect(c.peers()).toHaveLength(0);
  });
});
