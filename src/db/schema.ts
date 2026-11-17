import { jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  notionToken: text("notion_token"), // encrypted
  notionParentPageId: text("notion_parent_page_id"),
  githubToken: text("github_token"), // encrypted
  defaultRepo: text("default_repo"),
  repos: text("repos").array().notNull().default([]),
});

export const members = pgTable(
  "members",
  {
    officeId: uuid("office_id").notNull().references(() => offices.id),
    userId: text("user_id").notNull().references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.officeId, t.userId] })],
);

export const invites = pgTable("invites", {
  code: text("code").primaryKey(),
  officeId: uuid("office_id").notNull().references(() => offices.id),
});

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  officeId: uuid("office_id").notNull().references(() => offices.id),
  notionPageId: text("notion_page_id").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: ["draft", "confirmed"] }).notNull().default("draft"),
  summary: jsonb("summary").$type<{ decisions: string[] }>().notNull(),
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
});
