import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/db/testdb";
import type { Db } from "@/db";
import { recentActivity } from "./activity";
import { ValidationError } from "./errors";
import { officeMembers } from "./meetings";
import { createInvite, createOffice, ForbiddenError, joinByInvite, upsertUser } from "./offices";
import { addItem, listItems, MAX_PER_KIND, removeItem, setToday } from "./team-items";

let db: Db;
let teamId: string;

beforeEach(async () => {
  db = await makeTestDb();
  await upsertUser(db, { id: "admin", email: "a@x.c", name: "관리자" });
  await upsertUser(db, { id: "m1", email: "m@x.c", name: "민수" });
  await upsertUser(db, { id: "m2", email: "n@x.c", name: "지은" });
  await upsertUser(db, { id: "out", email: "o@x.c", name: "외부" });
  teamId = (await createOffice(db, "admin", "팀")).id;
  await joinByInvite(db, await createInvite(db, teamId), "m1", "minsu");
  await joinByInvite(db, await createInvite(db, teamId), "m2", "jieun");
});

describe("team rules, notices and links", () => {
  it("lets a member add a rule and everyone in the team read it with the author's name", async () => {
    await addItem(db, teamId, "m1", { kind: "rule", title: "PR은 하루 안에 리뷰한다" });
    const items = await listItems(db, teamId, "m2");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "rule", title: "PR은 하루 안에 리뷰한다", authorName: "민수", mine: false });
    expect((await listItems(db, teamId, "m1"))[0].mine).toBe(true);
  });

  it("puts a notice in the activity feed but not a rule", async () => {
    await addItem(db, teamId, "m1", { kind: "rule", title: "규칙" });
    await addItem(db, teamId, "m1", { kind: "notice", title: "금요일 시연" });
    const feed = (await recentActivity(db, teamId, "m1")).map((f) => f.text);
    expect(feed.some((t) => t.includes("금요일 시연"))).toBe(true);
    expect(feed.some((t) => t.includes("규칙"))).toBe(false);
  });

  it("needs an http(s) address for a link and uses the host when there is no title", async () => {
    await addItem(db, teamId, "m1", { kind: "link", title: "", url: "https://www.figma.com/file/x" });
    expect((await listItems(db, teamId, "m1"))[0]).toMatchObject({ kind: "link", title: "www.figma.com", url: "https://www.figma.com/file/x" });
    await expect(addItem(db, teamId, "m1", { kind: "link", title: "x", url: "javascript:alert(1)" })).rejects.toBeInstanceOf(ValidationError);
    await expect(addItem(db, teamId, "m1", { kind: "link", title: "x", url: "not a url" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an unknown kind, an empty or too long text, and too many items", async () => {
    await expect(addItem(db, teamId, "m1", { kind: "poem", title: "a" })).rejects.toBeInstanceOf(ValidationError);
    await expect(addItem(db, teamId, "m1", { kind: "rule", title: "   " })).rejects.toBeInstanceOf(ValidationError);
    await expect(addItem(db, teamId, "m1", { kind: "rule", title: "가".repeat(301) })).rejects.toBeInstanceOf(ValidationError);
    for (let i = 0; i < MAX_PER_KIND; i++) await addItem(db, teamId, "m1", { kind: "rule", title: `규칙 ${i}` });
    await expect(addItem(db, teamId, "m1", { kind: "rule", title: "하나 더" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("lets the author or the admin remove an item, but not another member", async () => {
    await addItem(db, teamId, "m1", { kind: "rule", title: "a" });
    await addItem(db, teamId, "m1", { kind: "rule", title: "b" });
    const [a, b] = await listItems(db, teamId, "m1");
    await expect(removeItem(db, teamId, "m2", a.id)).rejects.toBeInstanceOf(ForbiddenError);
    await removeItem(db, teamId, "m1", a.id);
    await removeItem(db, teamId, "admin", b.id);
    expect(await listItems(db, teamId, "m1")).toHaveLength(0);
  });

  it("keeps outsiders out of every action, and an item id from another team is not removable", async () => {
    await expect(addItem(db, teamId, "out", { kind: "rule", title: "a" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listItems(db, teamId, "out")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeItem(db, teamId, "out", "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(ForbiddenError);
    const other = (await createOffice(db, "out", "다른 팀")).id;
    await addItem(db, other, "out", { kind: "rule", title: "남의 규칙" });
    const [theirs] = await listItems(db, other, "out");
    await expect(removeItem(db, teamId, "admin", theirs.id)).rejects.toBeInstanceOf(ValidationError);
    expect(await listItems(db, other, "out")).toHaveLength(1);
  });
});

describe("today (one line about what I am doing today)", () => {
  const todayOf = async (id: string) => (await officeMembers(db, teamId)).find((m) => m.userId === id)?.today;

  it("is saved for me, trimmed, and can be cleared", async () => {
    await setToday(db, teamId, "m1", "  로그인 화면 마무리  ");
    expect(await todayOf("m1")).toBe("로그인 화면 마무리");
    await setToday(db, teamId, "m1", "");
    expect(await todayOf("m1")).toBe("");
  });

  it("rejects non-text and anything over 100 characters, and refuses outsiders", async () => {
    await expect(setToday(db, teamId, "m1", 5)).rejects.toBeInstanceOf(ValidationError);
    await expect(setToday(db, teamId, "m1", "가".repeat(101))).rejects.toBeInstanceOf(ValidationError);
    await expect(setToday(db, teamId, "out", "x")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
