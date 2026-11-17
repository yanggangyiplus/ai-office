import { expect, it } from "vitest";
import { makeTestDb } from "./testdb";
import { users } from "./schema";

it("applies migrations to an in-memory db and round-trips a row", async () => {
  const db = await makeTestDb();
  await db.insert(users).values({ id: "u1", email: "a@b.c", name: "A" });
  expect((await db.select().from(users))[0].id).toBe("u1");
});
