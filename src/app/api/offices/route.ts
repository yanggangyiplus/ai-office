import { auth } from "@/auth";
import { db } from "@/db";
import { createOffice, upsertUser } from "@/lib/offices";

export async function POST(req: Request) {
  const s = await auth();
  if (!s) return new Response("unauthorized", { status: 401 });
  const { name } = await req.json();
  if (typeof name !== "string" || !name.trim()) return new Response("name required", { status: 400 });
  await upsertUser(db, s.user);
  return Response.json(await createOffice(db, s.user.id, name.trim()));
}
