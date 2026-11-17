import { describe, expect, it } from "vitest";
import { todoPayload } from "./todo-payload";

describe("todoPayload (what the editor sends on save)", () => {
  const row = { id: "1", title: "로그인", assigneeUserId: "u1", repo: "a/b", description: null, issueUrl: null, role: "개발" };
  it("keeps the role, so saving does not wipe it", () => {
    expect(todoPayload([row])[0]).toMatchObject({ role: "개발" });
  });
  it("skips rows that already became issues and rows without a title", () => {
    expect(todoPayload([{ ...row, issueUrl: "x" }, { ...row, title: "  " }])).toEqual([]);
  });
});
