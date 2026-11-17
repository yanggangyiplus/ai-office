import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const key = () => Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "base64");

// Layout: iv(12) | authTag(16) | ciphertext, base64.
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}

export function decrypt(cipher: string): string {
  const buf = Buffer.from(cipher, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}
