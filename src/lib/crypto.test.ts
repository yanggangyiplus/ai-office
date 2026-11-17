import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("token crypto key check", () => {
  it("names TOKEN_ENCRYPTION_KEY when it is missing or not 32 bytes", () => {
    const saved = process.env.TOKEN_ENCRYPTION_KEY;
    try {
      delete process.env.TOKEN_ENCRYPTION_KEY;
      expect(() => encrypt("x")).toThrow(/TOKEN_ENCRYPTION_KEY/);
      process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
      expect(() => encrypt("x")).toThrow(/TOKEN_ENCRYPTION_KEY/);
      expect(() => decrypt("AAAA")).toThrow(/TOKEN_ENCRYPTION_KEY/);
    } finally {
      process.env.TOKEN_ENCRYPTION_KEY = saved;
    }
  });
});

describe("token crypto", () => {
  it("decrypt(encrypt(x)) returns x", () => {
    expect(decrypt(encrypt("ghp_secret"))).toBe("ghp_secret");
  });

  it("encrypts the same input to different ciphertexts", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("throws when the ciphertext was tampered with", () => {
    const buf = Buffer.from(encrypt("x"), "base64");
    buf[buf.length - 1] ^= 1;
    expect(() => decrypt(buf.toString("base64"))).toThrow();
  });
});
