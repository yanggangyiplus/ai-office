import NextAuth from "next-auth";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { saveConnection } from "@/lib/connections";
import { upsertUser } from "@/lib/offices";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  events: {
    // Signing in with GitHub also connects GitHub: keep the user's handle and the token for creating issues.
    async signIn({ user, account, profile }) {
      if (account?.provider !== "github" || !account.providerAccountId || !account.access_token) return;
      try {
        const login = typeof profile?.login === "string" ? profile.login : undefined;
        const email = user.email ?? `${login ?? account.providerAccountId}@users.noreply.github.com`;
        await upsertUser(db, { id: account.providerAccountId, email, name: user.name ?? login ?? "GitHub 사용자" });
        if (login) await db.update(users).set({ githubUsername: login }).where(eq(users.id, account.providerAccountId));
        await saveConnection(db, account.providerAccountId, "github", account.access_token);
      } catch (e) {
        console.error("github connection not saved", e instanceof Error ? e.message : e); // never block sign-in
      }
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: { id: string; email: string; name: string };
  }
}
