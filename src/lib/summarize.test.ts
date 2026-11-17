import { describe, expect, it } from "vitest";
import { matchAssignee, summarizeMeeting } from "./summarize";

const json = {
  decisions: ["A로 간다"],
  todos: [{ title: "API 만들기", assigneeName: "민수", description: "로그인" }],
};

describe("summarizeMeeting", () => {
  it("parses the model's JSON into a Summary", async () => {
    const s = await summarizeMeeting(async () => JSON.stringify(json), "회의 내용");
    expect(s).toEqual(json);
  });

  it("accepts JSON wrapped in a markdown code fence", async () => {
    const s = await summarizeMeeting(async () => "```json\n" + JSON.stringify(json) + "\n```", "x");
    expect(s.decisions).toEqual(["A로 간다"]);
  });

  it("throws when the output is not JSON", async () => {
    await expect(summarizeMeeting(async () => "죄송합니다", "x")).rejects.toThrow();
  });

  it("throws when the JSON has the wrong shape", async () => {
    await expect(summarizeMeeting(async () => '{"decisions":"x"}', "x")).rejects.toThrow();
  });
});

describe("summarizeMeeting roles", () => {
  it("offers the preset roles in the prompt", async () => {
    let prompt = "";
    await summarizeMeeting(async (p) => { prompt = p; return JSON.stringify({ decisions: [], todos: [] }); }, "회의");
    for (const r of ["PO", "기획", "디자인", "개발", "마케팅", "QA"]) expect(prompt).toContain(r);
  });
  it("keeps a todo's role", async () => {
    const out = JSON.stringify({ decisions: [], todos: [{ title: "시안", assigneeName: null, role: "디자인" }] });
    expect((await summarizeMeeting(async () => out, "x")).todos[0].role).toBe("디자인");
  });
  it("accepts a todo with no role or a null role", async () => {
    const out = JSON.stringify({ decisions: [], todos: [{ title: "a", assigneeName: null }, { title: "b", assigneeName: null, role: null }] });
    const s = await summarizeMeeting(async () => out, "x");
    expect(s.todos.map((t) => t.role ?? null)).toEqual([null, null]);
  });
  it("rejects a role that is not text", async () => {
    const out = JSON.stringify({ decisions: [], todos: [{ title: "a", assigneeName: null, role: 3 }] });
    await expect(summarizeMeeting(async () => out, "x")).rejects.toThrow();
  });
});

describe("matchAssignee", () => {
  const members = [
    { userId: "u1", name: "민수", githubUsername: "minsu-dev" },
    { userId: "u2", name: "지은", githubUsername: "Jieun" },
  ];

  it("matches by name", () => expect(matchAssignee("민수", members)).toBe("u1"));
  it("matches github username ignoring case", () => expect(matchAssignee("jieun", members)).toBe("u2"));
  it("returns null for a name that is not a member", () => expect(matchAssignee("철수", members)).toBeNull());
  it("returns null for null", () => expect(matchAssignee(null, members)).toBeNull());
});
