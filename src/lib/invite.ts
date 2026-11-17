const CODE = /^[A-Za-z0-9_-]+$/; // matches the base64url codes createInvite makes

// Accepts a bare code, a full invite link or a /join/<code> path and returns just the code (or null).
export function inviteCodeFrom(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const m = text.match(/\/join\/([^/?#\s]+)/);
  const code = m ? m[1] : text;
  return CODE.test(code) ? code : null;
}
