import type { WorkItem } from "./github";

export type BoardMember = { userId: string; name: string; githubUsername: string };
export type BoardRow = {
  member: { userId: string; name: string };
  doing: WorkItem[];
  next: WorkItem[];
  done: WorkItem[];
};

export function buildBoard(items: WorkItem[], members: BoardMember[]): BoardRow[] {
  return members.map((m) => {
    const mine = items.filter((i) => i.assignee?.toLowerCase() === m.githubUsername.toLowerCase());
    return {
      member: { userId: m.userId, name: m.name },
      doing: mine.filter((i) => i.state === "open" && i.hasOpenPr),
      next: mine.filter((i) => i.state === "open" && !i.hasOpenPr),
      done: mine.filter((i) => i.state === "closed"),
    };
  });
}
