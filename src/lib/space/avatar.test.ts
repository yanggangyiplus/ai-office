import { describe, expect, it } from "vitest";
import { avatarColors, avatarSprite } from "./avatar";

const DIRS = ["up", "down", "left", "right"] as const;

describe("avatarSprite", () => {
  it("is always 8x8 for every direction and walk frame", () => {
    for (const d of DIRS)
      for (const f of [0, 1] as const) {
        const s = avatarSprite(d, f);
        expect(s).toHaveLength(8);
        for (const row of s) expect(row).toHaveLength(8);
      }
  });
  it("shows no eyes from behind and one eye in profile", () => {
    expect(avatarSprite("up").join("")).not.toContain("E");
    expect(avatarSprite("left").join("").split("E").length - 1).toBe(1);
    expect(avatarSprite("right").join("").split("E").length - 1).toBe(1);
    expect(avatarSprite("down").join("").split("E").length - 1).toBe(2);
  });
  it("alternates the legs between frames", () => {
    expect(avatarSprite("down", 0)[7]).not.toBe(avatarSprite("down", 1)[7]);
  });
});

describe("avatarColors", () => {
  it("paints every part of the sprite for any user id (regression: negative hash index left the shirt unpainted)", () => {
    const parts = new Set(avatarSprite("down").join("").replaceAll(".", ""));
    for (let i = 0; i < 300; i++) {
      const c = avatarColors(`google-oauth2|${i * 7919}-${"x".repeat(i % 9)}`);
      for (const p of parts) expect(c[p], `part ${p} for id #${i}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it("gives the same colors for the same id", () => {
    expect(avatarColors("abc")).toEqual(avatarColors("abc"));
  });
});
