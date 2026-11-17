import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeTestDb } from "@/db/testdb";
import { connections } from "@/db/schema";
import type { Db } from "@/db";
import {
  NotConnectedError,
  connectionStatus,
  deleteConnection,
  requireToken,
  saveConnection,
} from "./connections";
import { ValidationError } from "./meetings";
import { upsertUser } from "./offices";

let db: Db;

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

beforeEach(async () => {
  db = await makeTestDb();
  await upsertUser(db, { id: "u1", email: "a@x.c", name: "A" });
});

describe("connections", () => {
  it("stores the token encrypted and returns the plaintext through requireToken", async () => {
    await saveConnection(db, "u1", "github", "ghp_plain");
    const [row] = await db.select().from(connections).where(eq(connections.userId, "u1"));
    expect(row.token).not.toBe("ghp_plain");
    expect(await requireToken(db, "u1", "github")).toBe("ghp_plain");
  });

  it("replaces the token when the same provider is saved again", async () => {
    await saveConnection(db, "u1", "notion", "old");
    await saveConnection(db, "u1", "notion", "new");
    const rows = await db.select().from(connections).where(and(eq(connections.userId, "u1"), eq(connections.provider, "notion")));
    expect(rows).toHaveLength(1);
    expect(await requireToken(db, "u1", "notion")).toBe("new");
  });

  it("reports status and reflects deletion", async () => {
    expect(await connectionStatus(db, "u1")).toEqual({ github: false, notion: false });
    await saveConnection(db, "u1", "github", "t");
    expect(await connectionStatus(db, "u1")).toEqual({ github: true, notion: false });
    await deleteConnection(db, "u1", "github");
    expect(await connectionStatus(db, "u1")).toEqual({ github: false, notion: false });
  });

  it("throws NotConnectedError naming the provider when no token is saved", async () => {
    const err = await requireToken(db, "u1", "notion").catch((e) => e);
    expect(err).toBeInstanceOf(NotConnectedError);
    expect(err.provider).toBe("notion");
  });

  it("rejects an empty token and an unknown provider", async () => {
    await expect(saveConnection(db, "u1", "github", "   ")).rejects.toBeInstanceOf(ValidationError);
    await expect(saveConnection(db, "u1", "gitlab" as never, "t")).rejects.toBeInstanceOf(ValidationError);
  });
});
