import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/db/testdb";
import type { Db } from "@/db";
import { logActivity, recentActivity } from "./activity";
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

describe("activity feed", () => {
  it("returns the newest items first, with the actor's name", async () => {
    await logActivity(db, teamId, "admin", "첫 번째");
    await logActivity(db, teamId, "m1", "두 번째");
    const feed = await recentActivity(db, teamId, "m1");
    expect(feed.map((f) => f.text)).toEqual(["두 번째", "첫 번째"]);
    expect(feed[0]).toMatchObject({ userId: "m1", name: "민수" });
    expect(typeof feed[0].at).toBe("number");
  });

  it("returns at most 30 items by default", async () => {
    for (let i = 0; i < 35; i++) await logActivity(db, teamId, "m1", `일 ${i}`);
    expect(await recentActivity(db, teamId, "m1")).toHaveLength(30);
  });

  it("only lets members read the feed", async () => {
    await expect(recentActivity(db, teamId, "out")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("never throws when logging fails, so the real action is not lost", async () => {
    await expect(logActivity(db, "00000000-0000-0000-0000-000000000000", "m1", "깨진 팀")).resolves.toBeUndefined();
    await expect(logActivity(db, teamId, "no-such-user", "깨진 사용자")).resolves.toBeUndefined();
  });
});
