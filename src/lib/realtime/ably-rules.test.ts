import { describe, expect, it } from "vitest";
import { applyPresence, isServerMessage, type PeerEntry } from "./ably-rules";
import type { Self } from "./types";

const me = { userId: "u-me" };
const data = (name: string, x = 10, y = 20) => ({ self: { id: "ignored", userId: "x", name } as Self, pos: { x, y, dir: "down" as const } });
const ev = (action: string, clientId: string, connectionId: string, d?: ReturnType<typeof data>) => ({ action, clientId, connectionId, data: d });

describe("isServerMessage (forged chat)", () => {
  it("accepts messages published with the server's API key, which carry no clientId", () => {
    expect(isServerMessage({ clientId: undefined })).toBe(true);
    expect(isServerMessage({ clientId: null })).toBe(true);
    expect(isServerMessage({})).toBe(true);
  });
  it("rejects a chat event published by a browser, which always carries its user's clientId", () => {
    expect(isServerMessage({ clientId: "u-someone" })).toBe(false);
  });
});

describe("applyPresence", () => {
  it("adds a peer on enter with the connection it came from", () => {
    const peers = new Map<string, PeerEntry>();
    expect(applyPresence(peers, ev("enter", "u1", "c1", data("민수")), me)).toBe(true);
    expect(peers.get("u1")).toMatchObject({ id: "u1", name: "민수", x: 10, y: 20, connectionId: "c1" });
  });

  it("updates a peer's position on update", () => {
    const peers = new Map<string, PeerEntry>();
    applyPresence(peers, ev("enter", "u1", "c1", data("민수")), me);
    applyPresence(peers, ev("update", "u1", "c1", data("민수", 99, 88)), me);
    expect(peers.get("u1")).toMatchObject({ x: 99, y: 88 });
  });

  it("removes a peer when its current connection leaves", () => {
    const peers = new Map<string, PeerEntry>();
    applyPresence(peers, ev("enter", "u1", "c1", data("민수")), me);
    expect(applyPresence(peers, ev("leave", "u1", "c1"), me)).toBe(true);
    expect(peers.has("u1")).toBe(false);
  });

  it("keeps a peer visible when only its OLD connection leaves after a new tab took over", () => {
    const peers = new Map<string, PeerEntry>();
    applyPresence(peers, ev("enter", "u1", "old", data("민수")), me);
    applyPresence(peers, ev("enter", "u1", "new", data("민수", 50, 60)), me); // new tab wins
    expect(applyPresence(peers, ev("leave", "u1", "old"), me)).toBe(false); // the kicked tab leaving
    expect(peers.get("u1")).toMatchObject({ connectionId: "new", x: 50, y: 60 });
  });

  it("treats absent like leave", () => {
    const peers = new Map<string, PeerEntry>();
    applyPresence(peers, ev("enter", "u1", "c1", data("민수")), me);
    applyPresence(peers, ev("absent", "u1", "c1"), me);
    expect(peers.has("u1")).toBe(false);
  });

  it("ignores my own account", () => {
    const peers = new Map<string, PeerEntry>();
    expect(applyPresence(peers, ev("enter", "u-me", "c9", data("나")), me)).toBe(false);
    expect(peers.size).toBe(0);
  });

  it("ignores a leave for someone it never saw", () => {
    expect(applyPresence(new Map(), ev("leave", "ghost", "c1"), me)).toBe(false);
  });
});
