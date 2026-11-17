import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/db/testdb";
import { messages } from "@/db/schema";
import type { Db } from "@/db";
import { recentChat, sendChat } from "./chat";
import { ValidationError } from "./errors";
import { createInvite, createOffice, ForbiddenError, joinByInvite, upsertUser } from "./offices";
import { REALTIME_TOKEN_TTL_MS, realtimeCapability, teamChannel } from "./realtime/server";
import type { ChatMessage } from "./realtime/types";

let db: Db;
let teamId: string;
let published: [string, ChatMessage][];
const publish = async (t: string, m: ChatMessage) => void published.push([t, m]);

beforeEach(async () => {
  published = [];
  db = await makeTestDb();
  await upsertUser(db, { id: "admin", email: "a@x.c", name: "관리자" });
  await upsertUser(db, { id: "m1", email: "m@x.c", name: "민수" });
  await upsertUser(db, { id: "out", email: "o@x.c", name: "외부" });
  teamId = (await createOffice(db, "admin", "팀")).id;
  await joinByInvite(db, await createInvite(db, teamId), "m1", "minsu");
});

describe("sendChat", () => {
  it("saves a member's message with their name and publishes it to the team channel", async () => {
    const m = await sendChat(db, publish, teamId, "m1", "  안녕하세요  ");
    expect(m).toMatchObject({ userId: "m1", name: "민수", body: "안녕하세요" });
    expect(published).toEqual([[teamId, m]]);
    expect((await db.select().from(messages)).map((r) => r.body)).toEqual(["안녕하세요"]);
  });

  it("refuses a non-member and neither saves nor publishes", async () => {
    await expect(sendChat(db, publish, teamId, "out", "hi")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.select().from(messages)).toHaveLength(0);
    expect(published).toHaveLength(0);
  });

  it("rejects empty, blank and over-long messages without saving or publishing", async () => {
    for (const body of ["", "   ", "가".repeat(501)]) {
      await expect(sendChat(db, publish, teamId, "m1", body)).rejects.toBeInstanceOf(ValidationError);
    }
    expect(await db.select().from(messages)).toHaveLength(0);
    expect(published).toHaveLength(0);
  });

  it("still returns the saved message when only the live publish fails (so a retry does not duplicate it)", async () => {
    const failing = async () => { throw new Error("ably down"); };
    const m = await sendChat(db, failing, teamId, "m1", "저장은 됐어요");
    expect(m.body).toBe("저장은 됐어요");
    expect((await db.select().from(messages)).map((r) => r.body)).toEqual(["저장은 됐어요"]);
  });

  it("accepts exactly 500 characters", async () => {
    const m = await sendChat(db, publish, teamId, "m1", "가".repeat(500));
    expect(m.body).toHaveLength(500);
  });

  it("stores HTML as plain text, unchanged (React escapes it when shown)", async () => {
    const m = await sendChat(db, publish, teamId, "m1", "<script>alert(1)</script>");
    expect(m.body).toBe("<script>alert(1)</script>");
  });
});

describe("recentChat", () => {
  it("returns the latest 100 of 101 messages, oldest first", async () => {
    for (let i = 1; i <= 101; i++) await sendChat(db, publish, teamId, "m1", `m${i}`);
    const r = await recentChat(db, teamId, "m1");
    expect(r).toHaveLength(100);
    expect(r[0].body).toBe("m2");
    expect(r[99].body).toBe("m101");
  });

  it("refuses a non-member", async () => {
    await expect(recentChat(db, teamId, "out")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("realtime channel access", () => {
  it("names the channel team:<id>", () => {
    expect(teamChannel("abc")).toBe("team:abc");
  });

  it("issues short-lived tokens so a removed member loses access within minutes", () => {
    expect(REALTIME_TOKEN_TTL_MS).toBeLessThanOrEqual(10 * 60 * 1000);
    expect(REALTIME_TOKEN_TTL_MS).toBeGreaterThanOrEqual(60 * 1000);
  });

  it("grants subscribe, publish and presence on the user's teams only", () => {
    expect(realtimeCapability(["a", "b"])).toEqual({
      "team:a": ["subscribe", "publish", "presence"],
      "team:b": ["subscribe", "publish", "presence"],
    });
    expect(realtimeCapability([])).toEqual({});
    expect(Object.keys(realtimeCapability(["a"]))).not.toContain("team:b");
  });
});
