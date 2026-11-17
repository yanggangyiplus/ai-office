import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Libs take this type so tests can pass an in-memory PGlite instead of Neon.
export type Db = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const db: Db = drizzle(neon(process.env.DATABASE_URL ?? "postgres://unset"), { schema }) as unknown as Db;
