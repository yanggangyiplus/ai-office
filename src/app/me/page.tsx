import { redirect } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { members, offices } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { connectionStatus } from "@/lib/connections";
import { upsertUser } from "@/lib/offices";
import { MyRoom } from "@/components/space/MyRoom";

export const instant = false;

export default async function Me() {
  await connection(); // request-time render: auth() re-encrypts the session cookie with random bytes
  const s = await auth();
  if (!s) redirect("/");
  await upsertUser(db, s.user);
  const teams = await db
    .select({ id: offices.id, name: offices.name })
    .from(members)
    .innerJoin(offices, eq(offices.id, members.officeId))
    .where(eq(members.userId, s.user.id));
  const status = await connectionStatus(db, s.user.id);
  return <MyRoom user={{ id: s.user.id, name: s.user.name }} teams={teams} status={status} isAdmin={isAdminEmail(s.user.email, process.env)} />;
}
