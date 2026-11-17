import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { joinOffice } from "@/app/actions";

export const instant = false;

export default async function Join({ params }: { params: Promise<{ code: string }> }) {
  await connection(); // request-time render: auth() re-encrypts the session cookie with random bytes
  const { code } = await params;
  if (!(await auth())) redirect("/");

  return (
    <main className="floor mx-auto my-16 flex w-full max-w-sm flex-col gap-4 border-4 border-black p-8">
      <form action={joinOffice} className="px flex flex-col gap-3 p-4">
        <input type="hidden" name="code" value={code} />
        <label className="font-bold">GitHub 사용자명</label>
        <input name="github" required className="px-input" />
        <button className="px-btn">입장</button>
      </form>
    </main>
  );
}
