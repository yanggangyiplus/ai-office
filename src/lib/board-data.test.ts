import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/db/testdb";
import type { Db } from "@/db";
import { NotConnectedError } from "./connections";
import { loadWork } from "./board-data";
import type { GithubLike } from "./github";
import { upsertUser } from "./offices";

let db: Db;

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});
beforeEach(async () => {
  db = await makeTestDb();
  await upsertUser(db, { id: "u1", email: "a@x.c", name: "A" });
});

describe("loadWork", () => {
  it("asks for repos when the team has none, without touching GitHub", async () => {
    const r = await loadWork(db, "u1", [], async () => { throw new Error("must not be called"); });
    expect(r.items).toEqual([]);
    expect(r.note).toMatch(/저장소/);
  });

  it("tells a user without a GitHub token to connect first instead of failing", async () => {
    const r = await loadWork(db, "u1", ["o/r"]); // real makeGithub, no token saved
    expect(r.items).toEqual([]);
    expect(r.note).toMatch(/내 공간/);
  });

  it("maps NotConnectedError from the client factory to the same connect hint", async () => {
    const r = await loadWork(db, "u1", ["o/r"], async () => { throw new NotConnectedError("github"); });
    expect(r.note).toMatch(/내 공간/);
  });

  it("reports a GitHub failure as a note, not an exception", async () => {
    const broken = { issues: { listForRepo: async () => { throw new Error("boom"); } }, pulls: { list: async () => ({ data: [] }) } } as unknown as GithubLike;
    const r = await loadWork(db, "u1", ["o/r"], async () => broken);
    expect(r.items).toEqual([]);
    expect(r.note).toMatch(/불러오지 못/);
  });

  it("returns the items with an empty note on success", async () => {
    const ok = {
      issues: { listForRepo: async () => ({ data: [{ number: 1, title: "A", state: "open", assignee: { login: "x" } }] }) },
      pulls: { list: async () => ({ data: [] }) },
    } as unknown as GithubLike;
    const r = await loadWork(db, "u1", ["o/r"], async () => ok);
    expect(r.note).toBe("");
    expect(r.items).toHaveLength(1);
  });
});
