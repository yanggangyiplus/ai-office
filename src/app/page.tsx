import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

// Cache Components is on by default; this page reads the session, so it must not be prerendered.
export const instant = false;

export default async function Home() {
  if (await auth()) redirect("/offices");
  return (
    <main className="flex min-h-screen items-center justify-center">
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/offices" });
        }}
      >
        <button className="rounded border-2 border-black px-6 py-3 font-bold">
          Google로 로그인
        </button>
      </form>
    </main>
  );
}
