import { auth } from "@/auth";
import { testLoginEnabled } from "@/auth.config";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { googleSignIn, testSignIn } from "./actions";

// Cache Components is on by default; this page reads the session, so it must not be prerendered.
export const instant = false;

export default async function Home() {
  await connection(); // request-time render: auth() re-encrypts the session cookie with random bytes
  if (await auth()) redirect("/offices");
  return (
    <main className="floor mx-auto my-16 flex w-full max-w-md flex-col gap-6 border-4 border-black p-8">
      <h1 className="text-3xl font-bold">AI 오피스</h1>
      <form action={googleSignIn}>
        <button className="px-btn w-full">Google로 로그인</button>
      </form>

      {testLoginEnabled(process.env) && (
        <form className="px flex flex-col gap-2 p-4" action={testSignIn}>
          <label className="font-bold">테스트 로그인 (개발용)</label>
          <input name="name" className="px-input" placeholder="이름 아무거나" required />
          <button className="px-btn">테스트로 입장</button>
        </form>
      )}
    </main>
  );
}
