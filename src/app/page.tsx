import { auth } from "@/auth";
import { githubLoginEnabled, testLoginEnabled } from "@/auth.config";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { githubSignIn, googleSignIn, testSignIn } from "./actions";

// Cache Components is on by default; this page reads the session, so it must not be prerendered.
export const instant = false;

export default async function Home() {
  await connection(); // request-time render: auth() re-encrypts the session cookie with random bytes
  if (await auth()) redirect("/me");
  return (
    <main className="floor mx-auto my-16 flex w-full max-w-xl flex-col gap-6 border border-[var(--line)] p-8">
      <div>
        <h1 className="text-3xl font-bold">AI 오피스</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--sub)]">
          팀이 함께 걸어 다니는 작은 사무실이에요. 회의를 기록하면 할 일이 되고, 할 일은 GitHub 이슈로 이어져요.
        </p>
      </div>
      <form action={googleSignIn}>
        <button className="px-btn w-full">Google로 로그인</button>
      </form>
      {githubLoginEnabled(process.env) && (
        <form action={githubSignIn}>
          <button className="px-btn w-full">GitHub로 로그인 (GitHub도 함께 연결)</button>
        </form>
      )}

      <ul className="grid gap-2 sm:grid-cols-3" aria-label="주요 기능">
        {[
          ["걸어 다니는 팀 공간", "상태를 고르면 캐릭터가 작업 자리·회의실·휴게 구역으로 이동해요"],
          ["회의 → 할 일 → 이슈", "회의록을 정리하면 담당자별 할 일과 GitHub 이슈가 만들어져요"],
          ["한눈에 보는 진행률", "팀과 개인의 진행률, 오늘 한 줄, 공지가 한 화면에 모여요"],
        ].map(([title, text]) => (
          <li key={title} className="rounded-lg border border-[var(--line)] bg-white p-3">
            <b className="text-sm">{title}</b>
            <p className="mt-1 text-xs leading-relaxed text-[var(--sub)]">{text}</p>
          </li>
        ))}
      </ul>

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
