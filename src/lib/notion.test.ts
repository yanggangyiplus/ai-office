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
  missing?: boolean;
}): NotionLike {
  const parents = opts.parents ?? { [CHILD]: PARENT, [PARENT]: null };
  return {
    pages: {
      async retrieve({ page_id }) {
        const id = page_id.replace(/-/g, "");
        if (opts.missing || !(id in parents)) throw new Error("object_not_found");
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
        async list() {
          return { results: opts.blocks ?? [], has_more: false, next_cursor: null };
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

  it("rejects a url with no page id", async () => {
    await expect(fetchMeetingText(fake({}), PARENT, "https://example.com/x")).rejects.toMatchObject({
      reason: "not_found",
    });
  });
});
