import { describe, expect, it } from "vitest";
import { authConfig, testLoginAuthorize, testLoginEnabled } from "./auth.config";

describe("test login (dev only)", () => {
  it("is off unless AUTH_TEST_LOGIN=1", () => {
    expect(testLoginEnabled({ NODE_ENV: "development" })).toBe(false);
  });
  it("is on in development with the flag", () => {
    expect(testLoginEnabled({ NODE_ENV: "development", AUTH_TEST_LOGIN: "1" })).toBe(true);
  });
  it("is never on in production, even with the flag", () => {
    expect(testLoginEnabled({ NODE_ENV: "production", AUTH_TEST_LOGIN: "1" })).toBe(false);
  });
  it("is never on on Vercel production or preview deployments", () => {
    expect(testLoginEnabled({ NODE_ENV: "development", AUTH_TEST_LOGIN: "1", VERCEL_ENV: "preview" })).toBe(false);
  });
  it("authorize builds a stable test user from the name", async () => {
    expect(await testLoginAuthorize({ name: " 민수 " })).toEqual({
      id: "test:민수",
      name: "민수",
      email: "민수@test.local",
    });
  });
  it("authorize rejects an empty name", async () => {
    expect(await testLoginAuthorize({ name: "  " })).toBeNull();
    expect(await testLoginAuthorize({})).toBeNull();
  });
});

describe("auth jwt callback", () => {
  it("keeps the Google account id as token.sub across logins (Auth.js otherwise assigns a random id)", async () => {
    const jwt = authConfig.callbacks!.jwt!;
    const first = await jwt({ token: { sub: "random-1" }, account: { providerAccountId: "google-123" } } as never);
    const second = await jwt({ token: { sub: "random-2" }, account: { providerAccountId: "google-123" } } as never);
    expect(first!.sub).toBe("google-123");
    expect(second!.sub).toBe("google-123");
  });

  it("leaves the token alone on later requests (no account)", async () => {
    const t = await authConfig.callbacks!.jwt!({ token: { sub: "google-123" } } as never);
    expect(t!.sub).toBe("google-123");
  });
});

describe("auth session callback", () => {
  it("puts the token sub into session.user.id", async () => {
    const session = { user: { email: "a@b.c", name: "A" }, expires: "x" };
    const result = await authConfig.callbacks!.session!({
      session,
      token: { sub: "google-123" },
    } as never);
    expect((result as { user: { id: string } }).user.id).toBe("google-123");
  });
});
