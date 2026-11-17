import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import type { Db } from "./index";

// Test-only: a fresh in-memory Postgres with the real migrations applied.
export async function makeTestDb(): Promise<Db> {
  const d = drizzle(new PGlite(), { schema });
  await migrate(d, { migrationsFolder: "./drizzle" });
  return d as unknown as Db;
}
