import { describe, expect, it } from "vitest";
import type { BoardRow } from "./board";
import type { WorkItem } from "./github";
import { filterBoardByRole, myProgress, teamProgress } from "./progress";

const item = (n: number, state: "open" | "closed" = "open", hasOpenPr = false): WorkItem => ({
  repo: "o/r", number: n, title: `일 ${n}`, assignee: "x", state, hasOpenPr,
});
const row = (userId: string, doing: WorkItem[], next: WorkItem[], done: WorkItem[]): BoardRow => ({
  member: { userId, name: userId }, doing, next, done,
});
const board: BoardRow[] = [
  row("a", [item(1, "open", true)], [item(2)], [item(3, "closed"), item(4, "closed")]), // 2 of 4 done
  row("b", [], [item(5), item(6)], []), // 0 of 2
  row("c", [], [], []), // nothing assigned
];

describe("teamProgress", () => {
  it("counts finished work over everything assigned", () => {
    const p = teamProgress(board);
    expect(p).toMatchObject({ total: 6, done: 2, doing: 1, next: 3, percent: 33 });
  });
  it("lists every member with their own numbers", () => {
    const p = teamProgress(board);
    expect(p.members.map((m) => [m.userId, m.done, m.total, m.percent])).toEqual([
      ["a", 2, 4, 50],
      ["b", 0, 2, 0],
      ["c", 0, 0, 0],
    ]);
  });
  it("is zero percent for an empty board, not NaN", () => {
    expect(teamProgress([])).toMatchObject({ total: 0, done: 0, percent: 0, members: [] });
  });
  it("rounds to a whole percent", () => {
    expect(teamProgress([row("a", [], [item(1), item(2)], [item(3, "closed")])]).percent).toBe(33);
    expect(teamProgress([row("a", [], [item(1)], [item(3, "closed"), item(4, "closed")])]).percent).toBe(67);
  });
});

describe("myProgress", () => {
  it("shows my numbers, what I am doing now and what comes next", () => {
    const p = myProgress(board, "a");
    expect(p).toMatchObject({ done: 2, total: 4, percent: 50 });
    expect(p.now?.title).toBe("일 1");
    expect(p.next?.title).toBe("일 2");
  });
  it("is empty for someone with nothing, and for someone not on the board", () => {
    expect(myProgress(board, "c")).toMatchObject({ done: 0, total: 0, percent: 0, now: null, next: null });
    expect(myProgress(board, "nobody")).toMatchObject({ done: 0, total: 0, percent: 0, now: null, next: null });
  });
});

describe("filterBoardByRole", () => {
  const roles = { a: ["개발", "QA"], b: ["디자인"], c: [] as string[] };
  it("keeps only the members who have the role, ignoring case", () => {
    expect(filterBoardByRole(board, roles, "개발").map((r) => r.member.userId)).toEqual(["a"]);
    expect(filterBoardByRole(board, { a: ["Dev"], b: [], c: [] }, "dev").map((r) => r.member.userId)).toEqual(["a"]);
  });
  it("keeps everyone for no filter", () => {
    expect(filterBoardByRole(board, roles, null)).toHaveLength(3);
  });
  it("returns nobody for a role nobody has", () => {
    expect(filterBoardByRole(board, roles, "마케팅")).toEqual([]);
  });
  it("treats a member missing from the roles map as having no roles", () => {
    expect(filterBoardByRole(board, {}, "개발")).toEqual([]);
  });
});
