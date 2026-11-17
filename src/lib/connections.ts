import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { connections } from "@/db/schema";
import { decrypt, encrypt } from "./crypto";
import { ValidationError } from "./meetings";

export type Provider = "github" | "notion";
const PROVIDERS: Provider[] = ["github", "notion"];

export class NotConnectedError extends Error {
  constructor(public provider: Provider) {
    super(`not connected: ${provider}`);
  }
}

export async function saveConnection(db: Db, userId: string, provider: Provider, token: string): Promise<void> {
  if (!PROVIDERS.includes(provider)) throw new ValidationError("unknown provider");
  const t = typeof token === "string" ? token.trim() : "";
  if (!t) throw new ValidationError("token required");
  const enc = encrypt(t);
  await db
    .insert(connections)
    .values({ userId, provider, token: enc })
    .onConflictDoUpdate({ target: [connections.userId, connections.provider], set: { token: enc } });
}

export async function deleteConnection(db: Db, userId: string, provider: Provider): Promise<void> {
  if (!PROVIDERS.includes(provider)) throw new ValidationError("unknown provider");
  await db.delete(connections).where(and(eq(connections.userId, userId), eq(connections.provider, provider)));
}

export async function connectionStatus(db: Db, userId: string): Promise<{ github: boolean; notion: boolean }> {
  const rows = await db.select({ provider: connections.provider }).from(connections).where(eq(connections.userId, userId));
  return { github: rows.some((r) => r.provider === "github"), notion: rows.some((r) => r.provider === "notion") };
}

export async function requireToken(db: Db, userId: string, provider: Provider): Promise<string> {
  const [row] = await db
    .select({ token: connections.token })
    .from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.provider, provider)));
  if (!row) throw new NotConnectedError(provider);
  return decrypt(row.token);
}
