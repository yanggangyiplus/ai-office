import { describe, expect, it } from "vitest";
import { realtimeMode } from "./mode";

describe("realtimeMode", () => {
  it("uses ably whenever a key is set", () => {
    expect(realtimeMode({ ABLY_API_KEY: "k", NODE_ENV: "production" })).toBe("ably");
    expect(realtimeMode({ ABLY_API_KEY: "k", NODE_ENV: "development" })).toBe("ably");
  });
  it("falls back to the local transport in development without a key", () => {
    expect(realtimeMode({ NODE_ENV: "development" })).toBe("local");
    expect(realtimeMode({})).toBe("local");
  });
  it("blocks the team space in production without a key", () => {
    expect(realtimeMode({ NODE_ENV: "production" })).toBe("blocked");
  });
  it("treats a blank key as missing", () => {
    expect(realtimeMode({ ABLY_API_KEY: "  ", NODE_ENV: "production" })).toBe("blocked");
  });
});
