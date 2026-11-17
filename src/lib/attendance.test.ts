import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/db/testdb";
import type { Db } from "@/db";
import { recentActivity } from "./activity";
import { checkIn, checkOut, presenceOf, setStatus } from "./attendance";
import { ValidationError } from "./errors";
import { createInvite, createOffice, ForbiddenError, joinByInvite, upsertUser } from "./offices";

let db: Db;
let teamId: string;

beforeEach(async () => {
  db = await makeTestDb();
  await upsertUser(db, { id: "admin", email: "a@x.c", name: "관리자" });
  await upsertUser(db, { id: "m1", email: "m@x.c", name: "민수" });
  await upsertUser(db, { id: "out", email: "o@x.c", name: "외부" });
  teamId = (await createOffice(db, "admin", "팀")).id;
  await joinByInvite(db, await createInvite(db, teamId), "m1", "minsu");
});

describe("attendance", () => {
  it("starts everyone as not present", async () => {
    const p = await presenceOf(db, teamId);
    expect(p.get("m1")).toMatchObject({ present: false });
  });

  it("marks a member present after checking in, and not present after checking out", async () => {
    await checkIn(db, teamId, "m1");
    expect((await presenceOf(db, teamId)).get("m1")).toMatchObject({ present: true, status: "working" });
    await checkOut(db, teamId, "m1");
    expect((await presenceOf(db, teamId)).get("m1")).toMatchObject({ present: false });
  });

  it("checking in twice does not create a second open row or a second feed item", async () => {
    await checkIn(db, teamId, "m1");
    await checkIn(db, teamId, "m1");
    const feed = await recentActivity(db, teamId, "m1");
    expect(feed.filter((f) => f.text.includes("출근"))).toHaveLength(1);
  });

  it("can check in again the next time after checking out", async () => {
    await checkIn(db, teamId, "m1");
    await checkOut(db, teamId, "m1");
    await checkIn(db, teamId, "m1");
    expect((await presenceOf(db, teamId)).get("m1")!.present).toBe(true);
  });

  it("refuses non-members for every action", async () => {
    await expect(checkIn(db, teamId, "out")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(checkOut(db, teamId, "out")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setStatus(db, teamId, "out", "away")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await recentActivity(db, teamId, "admin")).toHaveLength(0);
  });
});

describe("status", () => {
  it("lets a checked-in member change their status, and puts it in the feed", async () => {
    await checkIn(db, teamId, "m1");
    await setStatus(db, teamId, "m1", "meal");
    expect((await presenceOf(db, teamId)).get("m1")).toMatchObject({ present: true, status: "meal" });
    expect((await recentActivity(db, teamId, "m1"))[0].text).toContain("식사");
  });

  it("refuses to change the status of someone who has not checked in", async () => {
    await expect(setStatus(db, teamId, "m1", "away")).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an unknown status", async () => {
    await checkIn(db, teamId, "m1");
    await expect(setStatus(db, teamId, "m1", "sleeping")).rejects.toBeInstanceOf(ValidationError);
    await expect(setStatus(db, teamId, "m1", 3)).rejects.toBeInstanceOf(ValidationError);
  });

  it("resets the status to working after checking out and in again", async () => {
    await checkIn(db, teamId, "m1");
    await setStatus(db, teamId, "m1", "away");
    await checkOut(db, teamId, "m1");
    await checkIn(db, teamId, "m1");
    expect((await presenceOf(db, teamId)).get("m1")!.status).toBe("working");
  });
});
