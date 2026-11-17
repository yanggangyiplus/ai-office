import type { BoardRow } from "./board";
import type { WorkItem } from "./github";

const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);
const totalOf = (r: BoardRow) => r.doing.length + r.next.length + r.done.length;

export type MemberProgress = { userId: string; name: string; done: number; total: number; percent: number };

// Finished work over everything assigned to someone (unassigned issues are not on the board).
export function teamProgress(board: BoardRow[]) {
  const members: MemberProgress[] = board.map((r) => ({
    userId: r.member.userId,
    name: r.member.name,
    done: r.done.length,
    total: totalOf(r),
    percent: pct(r.done.length, totalOf(r)),
  }));
  const done = board.reduce((n, r) => n + r.done.length, 0);
  const total = board.reduce((n, r) => n + totalOf(r), 0);
  return {
    total,
    done,
    doing: board.reduce((n, r) => n + r.doing.length, 0),
    next: board.reduce((n, r) => n + r.next.length, 0),
    percent: pct(done, total),
    members,
  };
}

export function myProgress(board: BoardRow[], userId: string): {
  done: number;
  total: number;
  percent: number;
  now: WorkItem | null;
  next: WorkItem | null;
} {
  const r = board.find((x) => x.member.userId === userId);
  if (!r) return { done: 0, total: 0, percent: 0, now: null, next: null };
  return { done: r.done.length, total: totalOf(r), percent: pct(r.done.length, totalOf(r)), now: r.doing[0] ?? null, next: r.next[0] ?? null };
}

// Keeps the members who have the role; no role means everyone.
export function filterBoardByRole(board: BoardRow[], rolesByUser: Record<string, string[]>, role: string | null): BoardRow[] {
  if (!role) return board;
  const key = role.toLowerCase();
  return board.filter((r) => (rolesByUser[r.member.userId] ?? []).some((x) => x.toLowerCase() === key));
}
