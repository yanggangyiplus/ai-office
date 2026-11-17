import Anthropic from "@anthropic-ai/sdk";

import { PRESET_ROLES } from "./roles";

export type Summary = {
  decisions: string[];
  todos: { title: string; assigneeName: string | null; description?: string; role?: string | null }[];
};
export type Llm = (prompt: string) => Promise<string>;

const PROMPT = `다음 회의록에서 결정 사항과 할 일을 추출해 JSON으로만 답하세요. 설명이나 코드 블록 없이 JSON만 출력합니다.
형식: {"decisions": string[], "todos": [{"title": string, "assigneeName": string | null, "description": string, "role": string | null}]}
담당자가 회의록에 분명히 적혀 있지 않으면 assigneeName은 null로 두세요.
role은 그 일을 맡을 역할이며 ${PRESET_ROLES.join(", ")} 중에서 고르세요. 알 수 없으면 null로 두세요.

회의록:
`;

export async function summarizeMeeting(llm: Llm, text: string): Promise<Summary> {
  const raw = (await llm(PROMPT + text)).trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const s = JSON.parse(raw);
  const ok =
    Array.isArray(s?.decisions) &&
    s.decisions.every((d: unknown) => typeof d === "string") &&
    Array.isArray(s?.todos) &&
    s.todos.every(
      (t: { title?: unknown; assigneeName?: unknown; role?: unknown }) =>
        typeof t?.title === "string" &&
        (t.assigneeName === null || typeof t.assigneeName === "string") &&
        (t.role === undefined || t.role === null || typeof t.role === "string"),
    );
  if (!ok) throw new Error("unexpected summary shape");
  return s;
}

export function matchAssignee(
  name: string | null,
  members: { userId: string; name: string; githubUsername: string }[],
): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  const m = members.find((x) => x.name.toLowerCase() === n || x.githubUsername?.toLowerCase() === n);
  return m ? m.userId : null;
}

export const anthropicLlm: Llm = async (prompt) => {
  const r = await new Anthropic().messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  const block = r.content[0];
  return block.type === "text" ? block.text : "";
};
