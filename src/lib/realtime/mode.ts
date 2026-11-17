// ably: real service; local: same-browser tabs only (dev); blocked: production without a key.
export function realtimeMode(env: Record<string, string | undefined>): "ably" | "local" | "blocked" {
  if (env.ABLY_API_KEY?.trim()) return "ably";
  return env.NODE_ENV === "production" ? "blocked" : "local";
}
