import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

type Env = Record<string, string | undefined>;

// Test login lets anyone in by typing a name, so it must never run on a deployed site:
// it needs the explicit flag AND a non-production, non-Vercel environment.
export function testLoginEnabled(env: Env): boolean {
  return env.AUTH_TEST_LOGIN === "1" && env.NODE_ENV !== "production" && !env.VERCEL_ENV;
}

export async function testLoginAuthorize(creds: Partial<Record<string, unknown>>) {
  const name = typeof creds.name === "string" ? creds.name.trim() : "";
  if (!name) return null;
  return { id: `test:${name}`, name, email: `${name}@test.local` };
}

// GitHub sign-in also stores the GitHub connection, so it only shows once its OAuth app keys exist.
export function githubLoginEnabled(env: Env): boolean {
  return !!env.AUTH_GITHUB_ID?.trim() && !!env.AUTH_GITHUB_SECRET?.trim();
}

export const authConfig = {
  providers: [
    Google,
    // repo scope lets the stored token create issues in the user's repositories
    ...(githubLoginEnabled(process.env) ? [GitHub({ authorization: { params: { scope: "read:user user:email repo" } } })] : []),
    ...(testLoginEnabled(process.env)
      ? [Credentials({ id: "test", name: "테스트 로그인", credentials: { name: {} }, authorize: testLoginAuthorize })]
      : []),
  ],
  callbacks: {
    // Auth.js gives every sign-in a fresh random user id; pin sub to the stable account id.
    jwt({ token, account, profile }) {
      if (account?.providerAccountId) token.sub = account.providerAccountId;
      // a GitHub account can hide its email; the session and users table need one
      if (account?.provider === "github" && !token.email && profile?.login) token.email = `${profile.login}@users.noreply.github.com`;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
