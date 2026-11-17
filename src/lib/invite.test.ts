import { describe, expect, it } from "vitest";
import { inviteCodeFrom } from "./invite";

describe("inviteCodeFrom", () => {
  it("accepts a bare code", () => {
    expect(inviteCodeFrom("nPDrmRrnGTT4")).toBe("nPDrmRrnGTT4");
  });
  it("trims whitespace", () => {
    expect(inviteCodeFrom("  abc-DEF_12  ")).toBe("abc-DEF_12");
  });
  it("takes the code out of a full invite link", () => {
    expect(inviteCodeFrom("https://example.com/join/nPDrmRrnGTT4")).toBe("nPDrmRrnGTT4");
    expect(inviteCodeFrom("http://localhost:3000/join/abc?x=1#top")).toBe("abc");
  });
  it("takes the code out of a path and ignores a trailing slash", () => {
    expect(inviteCodeFrom("/join/abc123/")).toBe("abc123");
  });
  it("returns null for empty input or something that is not a code", () => {
    expect(inviteCodeFrom("")).toBeNull();
    expect(inviteCodeFrom("   ")).toBeNull();
    expect(inviteCodeFrom("hello world!")).toBeNull();
    expect(inviteCodeFrom("https://example.com/other/abc")).toBeNull();
  });
});
