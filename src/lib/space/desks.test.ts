import { describe, expect, it } from "vitest";
import { TEAM_MAP, deskSpots } from "./map";
import { MAX_DESKS, assignDesks } from "./desks";

const m = (userId: string, t: number) => ({ userId, joinedAt: new Date(t) });

describe("assignDesks", () => {
  it("has as many desks as the map has spots", () => {
    expect(MAX_DESKS).toBe(deskSpots(TEAM_MAP).length);
  });

  it("gives desks in join order", () => {
    const d = assignDesks([m("c", 300), m("a", 100), m("b", 200)]);
    expect([d.get("a"), d.get("b"), d.get("c")]).toEqual([0, 1, 2]);
  });

  it("breaks a tie on the join time by user id", () => {
    const d = assignDesks([m("z", 100), m("b", 100)]);
    expect([d.get("b"), d.get("z")]).toEqual([0, 1]);
  });

  it("leaves the 13th and later members without a desk", () => {
    const members = Array.from({ length: 14 }, (_, i) => m(`u${String(i).padStart(2, "0")}`, i));
    const d = assignDesks(members);
    expect(d.get("u11")).toBe(11);
    expect(d.get("u12")).toBeNull();
    expect(d.get("u13")).toBeNull();
  });

  it("pulls later members up one desk when someone leaves", () => {
    const before = assignDesks([m("a", 1), m("b", 2), m("c", 3)]);
    const after = assignDesks([m("a", 1), m("c", 3)]);
    expect(before.get("c")).toBe(2);
    expect(after.get("c")).toBe(1);
  });

  it("handles an empty team", () => {
    expect(assignDesks([]).size).toBe(0);
  });
});
