import { describe, expect, it } from "vitest";
import { authConfig } from "./auth.config";

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
