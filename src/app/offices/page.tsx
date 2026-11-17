import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { members, offices } from "@/db/schema";
import { upsertUser } from "@/lib/offices";
import { CreateOfficeForm } from "@/components/Forms";

export const instant = false;

export default async function Offices() {
  await connection(); // request-time render: auth() re-encrypts the session cookie with random bytes
  const s = await auth();
  if (!s) redirect("/");
  await upsertUser(db, s.user);
  const mine = await db
    .select({ id: offices.id, name: offices.name })
    .from(members)
    .innerJoin(offices, eq(offices.id, members.officeId))
    .where(eq(members.userId, s.user.id));
  return (
    <main className="floor mx-auto my-8 flex w-full max-w-2xl flex-col gap-6 border-4 border-black p-8">
      <h1 className="text-2xl font-bold">내 오피스</h1>
      {mine.length === 0 && <p className="px p-4">아직 오피스가 없어요. 아래에서 만들거나 초대 링크로 들어오세요.</p>}
      <ul className="flex flex-col gap-3">
        {mine.map((o) => (
          <li key={o.id}>
            <Link className="px block p-4 font-bold hover:translate-x-1" href={`/offices/${o.id}`}>
              {o.name} 입장 →
            </Link>
          </li>
        ))}
      </ul>
      <div className="px p-4">
        <CreateOfficeForm />
      </div>
    </main>
  );
}
