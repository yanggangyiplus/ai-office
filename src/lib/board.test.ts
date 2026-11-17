import { describe, expect, it } from "vitest";
import { buildBoard } from "./board";
import type { WorkItem } from "./github";

const item = (n: number, o: Partial<WorkItem>): WorkItem => ({
  repo: "o/r",
  number: n,
  title: `i${n}`,
  assignee: "minsu",
  state: "open",
  hasOpenPr: false,
  ...o,
});

const members = [
  { userId: "u1", name: "민수", githubUsername: "Minsu" },
  { userId: "u2", name: "지은", githubUsername: "jieun" },
];

describe("buildBoard", () => {
  it("classifies open+PR as doing, open without PR as next, closed as done", () => {
    const [b] = buildBoard(
      [item(1, { hasOpenPr: true }), item(2, {}), item(3, { state: "closed" })],
      members,
    );
    expect(b.member).toEqual({ userId: "u1", name: "민수" });
    expect(b.doing.map((i) => i.number)).toEqual([1]);
    expect(b.next.map((i) => i.number)).toEqual([2]);
    expect(b.done.map((i) => i.number)).toEqual([3]);
  });

  it("drops unassigned and non-member items", () => {
    const board = buildBoard([item(1, { assignee: null }), item(2, { assignee: "stranger" })], members);
    expect(board.flatMap((b) => [...b.doing, ...b.next, ...b.done])).toEqual([]);
  });

  it("keeps a member with no items, with three empty lists", () => {
    const board = buildBoard([item(1, {})], members);
    expect(board.find((b) => b.member.userId === "u2")).toMatchObject({ doing: [], next: [], done: [] });
  });
});
