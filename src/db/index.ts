import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Libs take this type so tests can pass an in-memory PGlite instead of Neon.
export type Db = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Dev only: with no DATABASE_URL, use a local file-backed Postgres (PGlite) so the app runs without Neon.
async function localDb(): Promise<Db> {
  (await import("node:fs")).mkdirSync("./.data", { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: pgliteDrizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const d = pgliteDrizzle(new PGlite("./.data/pglite"), { schema });
  await migrate(d, { migrationsFolder: "./drizzle" });
  return d as unknown as Db;
}

// In production a missing DATABASE_URL must fail at query time (the build imports this module without env).
const useNeon = process.env.DATABASE_URL || process.env.NODE_ENV === "production";
// Cached on globalThis: dev bundles route handlers and pages separately, and two PGlite instances on one folder do not see each other's writes.
const g = globalThis as { __aiOfficeDb?: Promise<Db> };
g.__aiOfficeDb ??= Promise.resolve(
  useNeon ? (drizzle(neon(process.env.DATABASE_URL ?? "postgres://unset"), { schema }) as unknown as Db) : localDb(),
);
export const db: Db = await g.__aiOfficeDb;
