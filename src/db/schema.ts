import { jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Google sub
  email: text("email").notNull(),
  name: text("name").notNull(),
  githubUsername: text("github_username"),
});

export const offices = pgTable("offices", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  adminId: text("admin_id").notNull().references(() => users.id),
  notionParentPageId: text("notion_parent_page_id"),
  defaultRepo: text("default_repo"),
  repos: text("repos").array().notNull().default([]),
});

export const members = pgTable(
  "members",
  {
    officeId: uuid("office_id").notNull().references(() => offices.id),
    userId: text("user_id").notNull().references(() => users.id),
    joinedAt: timestamp("joined_at").notNull().defaultNow(), // desk order in the team space
    roles: text("roles").array().notNull().default([]), // PO, 디자인, 개발 ... (up to 5)
    status: text("status", { enum: ["working", "meeting", "away", "meal"] }).notNull().default("working"),
    today: text("today").notNull().default(""), // one line: what I am doing today
  },
  (t) => [primaryKey({ columns: [t.officeId, t.userId] })],
);

// Each person's own GitHub / Notion token (encrypted).
export const connections = pgTable(
  "connections",
  {
    userId: text("user_id").notNull().references(() => users.id),
    provider: text("provider", { enum: ["github", "notion"] }).notNull(),
    token: text("token").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);

export const invites = pgTable("invites", {
  code: text("code").primaryKey(),
  officeId: uuid("office_id").notNull().references(() => offices.id),
});

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  officeId: uuid("office_id").notNull().references(() => offices.id),
  notionPageId: text("notion_page_id"), // null for meetings written in the site
  title: text("title").notNull(),
  status: text("status", { enum: ["draft", "confirmed"] }).notNull().default("draft"),
  summary: jsonb("summary").$type<{ decisions: string[] }>().notNull(),
  notes: text("notes").notNull().default(""),
  links: jsonb("links").$type<{ title: string; url: string }[]>().notNull().default([]),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const todos = pgTable("todos", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id),
  title: text("title").notNull(),
  assigneeUserId: text("assignee_user_id").references(() => users.id),
  repo: text("repo").notNull(),
  description: text("description"),
  issueUrl: text("issue_url"),
  role: text("role"), // which role this work belongs to (used to suggest an assignee)
});

// One row per check-in; checkedOutAt stays null while the person is at work.
export const attendance = pgTable("attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  officeId: uuid("office_id").notNull().references(() => offices.id),
  userId: text("user_id").notNull().references(() => users.id),
  checkedInAt: timestamp("checked_in_at").notNull().defaultNow(),
  checkedOutAt: timestamp("checked_out_at"),
}, (t) => [
  // at most one open (not checked out) row per person per team, even when two check-ins race
  uniqueIndex("attendance_one_open").on(t.officeId, t.userId).where(sql`${t.checkedOutAt} is null`),
]);

// Team activity feed; the sentence is built when it is written (the name is added on screen).
export const activity = pgTable("activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  seq: serial("seq").notNull(),
  officeId: uuid("office_id").notNull().references(() => offices.id),
  userId: text("user_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Team chat history. `seq` gives a stable order even when two messages share a timestamp.
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  seq: serial("seq").notNull(),
  officeId: uuid("office_id").notNull().references(() => offices.id),
  userId: text("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// The team's own rules, notices and shared links (one table, told apart by kind).
export const teamItems = pgTable("team_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  officeId: uuid("office_id").notNull().references(() => offices.id),
  kind: text("kind", { enum: ["rule", "notice", "link"] }).notNull(),
  title: text("title").notNull(),
  url: text("url"),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
