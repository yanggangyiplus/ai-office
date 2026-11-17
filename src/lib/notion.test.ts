import { describe, expect, it } from "vitest";
import { NotionLinkError, fetchMeetingText, type NotionLike } from "./notion";

const PARENT = "11111111111111111111111111111111";
const CHILD = "22222222222222222222222222222222";
const URL = `https://www.notion.so/team/회의-${CHILD}`;

const text = (t: string) => ({ plain_text: t });
const para = (t: string) => ({ type: "paragraph", paragraph: { rich_text: [text(t)] } });

function fake(opts: {
  parents?: Record<string, string | null>; // pageId -> parent pageId (null = workspace)
  blocks?: unknown[];
  children?: Record<string, unknown[]>; // block id -> its child blocks
  missing?: boolean;
  failWith?: { code: string };
}): NotionLike {
  const parents = opts.parents ?? { [CHILD]: PARENT, [PARENT]: null };
  return {
    pages: {
      async retrieve({ page_id }: { page_id: string }) {
        const id = page_id.replace(/-/g, "");
        if (opts.failWith) throw Object.assign(new Error(opts.failWith.code), opts.failWith);
        if (opts.missing || !(id in parents)) throw Object.assign(new Error("not found"), { code: "object_not_found" });
        const p = parents[id];
        return {
          id,
          parent: p ? { type: "page_id", page_id: p } : { type: "workspace" },
          properties: { title: { type: "title", title: [text("주간 회의")] } },
        };
      },
    },
    blocks: {
      children: {
        async list({ block_id }: { block_id: string }) {
          const results = opts.children?.[block_id] ?? (block_id === CHILD ? (opts.blocks ?? []) : []);
          return { results, has_more: false, next_cursor: null };
        },
      },
    },
  } as unknown as NotionLike;
}

describe("fetchMeetingText", () => {
  it("returns title and concatenated text of text blocks only", async () => {
    const r = await fetchMeetingText(
      fake({ blocks: [para("결정: A로 간다"), { type: "child_database" }, { type: "embed" }, para("할 일: B")] }),
      PARENT,
      URL,
    );
    expect(r).toEqual({ pageId: CHILD, title: "주간 회의", text: "결정: A로 간다\n할 일: B" });
  });

  it("rejects a page that is not under the parent page", async () => {
    const c = fake({ parents: { [CHILD]: "99999999999999999999999999999999", "99999999999999999999999999999999": null } });
    await expect(fetchMeetingText(c, PARENT, URL)).rejects.toMatchObject({ reason: "not_under_parent" });
  });

  it("reports not_found when the page cannot be read", async () => {
    await expect(fetchMeetingText(fake({ missing: true }), PARENT, URL)).rejects.toMatchObject({ reason: "not_found" });
  });

  it("rejects text longer than 30,000 characters", async () => {
    const c = fake({ blocks: [para("가".repeat(30_001))] });
    await expect(fetchMeetingText(c, PARENT, URL)).rejects.toBeInstanceOf(NotionLinkError);
    await expect(fetchMeetingText(c, PARENT, URL)).rejects.toMatchObject({ reason: "too_long" });
  });

  it("includes text from nested child blocks (sub-bullets, toggles)", async () => {
    const parentBlock = { id: "b1", has_children: true, type: "toggle", toggle: { rich_text: [text("액션 아이템")] } };
    const r = await fetchMeetingText(
      fake({ blocks: [parentBlock], children: { b1: [para("민수: API 만들기")] } }),
      PARENT,
      URL,
    );
    expect(r.text).toBe("액션 아이템\n민수: API 만들기");
  });

  it("rejects nested text that pushes the page over the length cap", async () => {
    const parentBlock = { id: "b1", has_children: true, type: "paragraph", paragraph: { rich_text: [text("a")] } };
    const c = fake({ blocks: [parentBlock], children: { b1: [para("가".repeat(30_001))] } });
    await expect(fetchMeetingText(c, PARENT, URL)).rejects.toMatchObject({ reason: "too_long" });
  });

  it("does not report rate limits or network errors as not_found", async () => {
    const err = await fetchMeetingText(fake({ failWith: { code: "rate_limited" } }), PARENT, URL).catch((e) => e);
    expect(err).not.toBeInstanceOf(NotionLinkError);
  });

  it("accepts a dashed uuid in the link", async () => {
    const dashed = "https://www.notion.so/22222222-2222-2222-2222-222222222222";
    const r = await fetchMeetingText(fake({ blocks: [para("x")] }), PARENT, dashed);
    expect(r.pageId).toBe(CHILD);
  });

  it("rejects a url with no page id", async () => {
    await expect(fetchMeetingText(fake({}), PARENT, "https://example.com/x")).rejects.toMatchObject({
      reason: "not_found",
    });
  });
});
