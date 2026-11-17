import * as Ably from "ably";
import type { ChatMessage } from "./types";

export const teamChannel = (officeId: string) => `team:${officeId}`;

// What a browser may do on Ably: only the channels of teams it belongs to.
type Op = "subscribe" | "publish" | "presence";
export function realtimeCapability(teamIds: string[]): Record<string, Op[]> {
  const ops: Op[] = ["subscribe", "publish", "presence"];
  return Object.fromEntries(teamIds.map((id) => [teamChannel(id), ops]));
}

// Server-side publish of an already-saved chat message. Without a key (dev local mode) the browser relays it instead.
export async function publishChat(teamId: string, m: ChatMessage): Promise<void> {
  const key = process.env.ABLY_API_KEY?.trim();
  if (!key) return;
  await new Ably.Rest({ key }).channels.get(teamChannel(teamId)).publish("chat", m);
}
