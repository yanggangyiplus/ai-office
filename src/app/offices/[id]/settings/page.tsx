import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { offices } from "@/db/schema";
import { SettingsForm } from "@/components/Forms";

export const instant = false;

export default async function Settings({ params }: { params: Promise<{ id: string }> }) {
  await connection(); // request-time render: auth() re-encrypts the session cookie with random bytes
  const { id } = await params;
  const s = await auth();
  if (!s) redirect("/");
  const [o] = await db.select().from(offices).where(eq(offices.id, id));
  if (!o || o.adminId !== s.user.id) notFound();
  return (
    <main className="floor mx-auto my-8 flex w-full max-w-xl flex-col gap-4 border-4 border-black p-6">
      <Link href={`/offices/${id}`} className="underline">← 오피스로</Link>
      <h1 className="text-2xl font-bold">설정</h1>
      <div className="px p-4">
        {/* Tokens are never sent back to the browser; only whether they are set. */}
        <SettingsForm officeId={id} configured={{ notion: !!o.notionToken, github: !!o.githubToken }} />
      </div>
    </main>
  );
}
