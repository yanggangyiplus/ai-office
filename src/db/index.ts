import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Libs take this type so tests can pass an in-memory PGlite instead of Neon.
export type Db = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Dev only: with no DATABASE_URL, use an in-memory Postgres (PGlite) so the app runs without Neon.
// In memory on purpose: Next also loads page modules in a separate worker process (static params), and two
// processes opening one PGlite folder corrupt it. Data is lost when the dev server restarts.
async function localDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: pgliteDrizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const d = pgliteDrizzle(new PGlite(), { schema });
  await migrate(d, { migrationsFolder: "./drizzle" });
  const { demoMode, seedDemo } = await import("@/lib/demo");
  if (demoMode(process.env)) await seedDemo(d as unknown as Db); // dev-only sample team (SEED_DEMO=1)
  return d as unknown as Db;
}

// In production a missing DATABASE_URL must fail at query time (the build imports this module without env).
// POSTGRES_URL is what the Vercel Supabase integration sets (the pooled connection); DATABASE_URL wins when both exist.
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const useRemote = url || process.env.NODE_ENV === "production";
// Cached on globalThis: dev bundles route handlers and pages separately, and two PGlite instances on one folder do not see each other's writes.
// Stored on `process`, not globalThis: route bundles can get separate globalThis objects but share one process.
const g = process as unknown as { __aiOfficeDb?: Promise<Db> };
g.__aiOfficeDb ??= Promise.resolve(
  // prepare: false because Supabase's pooled (transaction-mode) connection does not support prepared statements; max 1 per serverless instance.
  useRemote ? (drizzle(postgres(url ?? "postgres://unset", { prepare: false, max: 1 }), { schema }) as unknown as Db) : localDb(),
).catch((e) => {
  g.__aiOfficeDb = undefined; // do not cache a failed init (dev hot reload can open the local db twice); the next import retries
  throw e;
});
export const db: Db = await g.__aiOfficeDb;
