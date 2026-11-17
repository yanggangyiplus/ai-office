import type { Status } from "@/lib/attendance";

// Plain data the server page hands to the team space screens.
export type MemberView = {
  userId: string;
  name: string;
  roles: string[];
  present: boolean; // checked in right now
  status: Status;
  desk: number | null;
};

export type TodoView = {
  id: string;
  title: string;
  assigneeName: string | null;
  role: string | null;
  issueUrl: string | null;
};

export type MeetingView = {
  id: string;
  title: string;
  status: "draft" | "confirmed";
  fromNotion: boolean; // imported from Notion (notes are read-only) or written in the site
  notionUrl: string | null;
  notes: string;
  links: { title: string; url: string }[];
  decisions: string[];
  todos: TodoView[];
  createdAt: number;
};

export const STATUS_LABEL: Record<Status, string> = { working: "하는 중", meeting: "회의 중", away: "자리 비움", meal: "식사 중" };
export const STATUS_COLOR: Record<Status | "off", string> = {
  off: "#b9c2cc", working: "#5fb37c", meeting: "#6a8fd8", away: "#d9a441", meal: "#d9a441",
};
