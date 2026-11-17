import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { joinByInvite, upsertUser } from "@/lib/offices";

export const instant = false;

export default async function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const s = await auth();
  if (!s) redirect("/");

  async function join(form: FormData) {
    "use server";
    const github = String(form.get("github") ?? "").trim();
    if (!github) return;
    await upsertUser(db, s!.user);
    const { officeId } = await joinByInvite(db, code, s!.user.id, github);
    redirect(`/offices/${officeId}`);
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <form action={join} className="flex flex-col gap-3">
        <label className="font-bold">GitHub 사용자명</label>
        <input name="github" required className="border-2 border-black p-2" />
        <button className="border-2 border-black px-4 py-2 font-bold">입장</button>
      </form>
    </main>
  );
}
