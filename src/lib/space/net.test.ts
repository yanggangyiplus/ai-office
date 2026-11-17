import { describe, expect, it } from "vitest";
import { shouldPublishMove, shouldRefreshPresence } from "./net";

describe("shouldPublishMove", () => {
  it("sends the first position", () => {
    expect(shouldPublishMove(null, 1000, { x: 5, y: 5 })).toBe(true);
  });
  it("waits at least 200ms between sends", () => {
    const last = { at: 1000, x: 0, y: 0 };
    expect(shouldPublishMove(last, 1199, { x: 10, y: 0 })).toBe(false);
    expect(shouldPublishMove(last, 1200, { x: 10, y: 0 })).toBe(true);
  });
  it("sends nothing when the position did not change", () => {
    expect(shouldPublishMove({ at: 0, x: 3, y: 4 }, 5000, { x: 3, y: 4 })).toBe(false);
  });
});

describe("shouldRefreshPresence", () => {
  it("refreshes the moment the player stops", () => {
    expect(shouldRefreshPresence(1000, 1050, false, true)).toBe(true);
  });
  it("refreshes every 5 seconds while walking", () => {
    expect(shouldRefreshPresence(0, 4999, true, false)).toBe(false);
    expect(shouldRefreshPresence(0, 5000, true, false)).toBe(true);
  });
  it("does nothing while standing still", () => {
    expect(shouldRefreshPresence(0, 60_000, false, false)).toBe(false);
  });
});
