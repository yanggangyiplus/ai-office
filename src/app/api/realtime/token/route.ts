import * as Ably from "ably";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { members } from "@/db/schema";
import { realtimeCapability } from "@/lib/realtime/server";

// Ably calls this (authUrl) to get a short-lived token limited to the signed-in user's own teams.
async function issue() {
  const s = await auth();
  if (!s) return new Response("unauthorized", { status: 401 });
  const key = process.env.ABLY_API_KEY?.trim();
  if (!key) return new Response("realtime not configured", { status: 503 });
  const teams = await db.select({ id: members.officeId }).from(members).where(eq(members.userId, s.user.id));
  const token = await new Ably.Rest({ key }).auth.createTokenRequest({
    clientId: s.user.id,
    capability: realtimeCapability(teams.map((t) => t.id)),
    ttl: 60 * 60 * 1000,
  });
  return Response.json(token);
}

export const GET = issue;
export const POST = issue;
