export const MAX_MEETING_CHARS = 30_000;
const MAX_DEPTH = 5;
// Notion API error codes that mean "this page is not reachable with our token".
const UNREACHABLE = new Set(["object_not_found", "unauthorized", "restricted_resource"]);

export class NotionLinkError extends Error {
  constructor(public reason: "not_under_parent" | "not_found" | "too_long") {
    super(reason);
  }
}

// The two Notion client calls we use, so tests can pass a fake.
export type NotionLike = {
  pages: { retrieve(a: { page_id: string }): Promise<PageLike> };
  blocks: {
    children: {
      list(a: { block_id: string; start_cursor?: string }): Promise<{
        results: BlockLike[];
        has_more: boolean;
        next_cursor: string | null;
      }>;
    };
  };
};
type PageLike = {
  parent: { type: string; page_id?: string };
  properties: Record<string, { type: string; title?: { plain_text: string }[] }>;
};
type BlockLike = { type: string; id?: string; has_children?: boolean } & Record<string, unknown>;

const norm = (id: string) => id.replace(/-/g, "").toLowerCase();

function pageIdFromUrl(url: string): string | null {
  const m = url.split(/[?#]/)[0].match(/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})\/?$/i);
  return m ? m[1].replace(/-/g, "").toLowerCase() : null;
}

function blockText(b: BlockLike): string | null {
  const rich = (b[b.type] as { rich_text?: { plain_text: string }[] } | undefined)?.rich_text;
  return rich ? rich.map((r) => r.plain_text).join("") : null; // databases/embeds have no rich_text
}

export async function fetchMeetingText(
  client: NotionLike,
  parentPageId: string,
  url: string,
): Promise<{ pageId: string; title: string; text: string }> {
  const pageId = pageIdFromUrl(url);
  if (!pageId) throw new NotionLinkError("not_found");
  const parent = norm(parentPageId);

  const get = async (id: string) => {
    try {
      return await client.pages.retrieve({ page_id: id });
    } catch (e) {
      // Only "unreachable" means not_found; rate limits and network errors must surface as real failures.
      if (UNREACHABLE.has((e as { code?: string }).code ?? "")) throw new NotionLinkError("not_found");
      throw e;
    }
  };

  const page = await get(pageId);
  let cur = page;
  let underParent = false;
  for (let i = 0; i < 20 && cur.parent.type === "page_id" && cur.parent.page_id; i++) {
    const up = norm(cur.parent.page_id);
    if (up === parent) {
      underParent = true;
      break;
    }
    cur = await get(up);
  }
  if (!underParent) throw new NotionLinkError("not_under_parent");

  const lines: string[] = [];
  let size = 0;
  // Walks a block's children depth-first (sub-bullets, toggles, columns) and enforces the length cap as it goes.
  const walk = async (blockId: string, depth: number): Promise<void> => {
    let cursor: string | undefined;
    do {
      const r = await client.blocks.children.list({ block_id: blockId, start_cursor: cursor });
      for (const b of r.results) {
        const t = blockText(b);
        if (t) {
          size += t.length + 1;
          if (size > MAX_MEETING_CHARS + 1) throw new NotionLinkError("too_long");
          lines.push(t);
        }
        if (b.has_children && typeof b.id === "string" && depth < MAX_DEPTH) await walk(b.id, depth + 1);
      }
      cursor = r.has_more && r.next_cursor ? r.next_cursor : undefined;
    } while (cursor);
  };
  await walk(pageId, 0);

  const text = lines.join("\n");
  if (text.length > MAX_MEETING_CHARS) throw new NotionLinkError("too_long");

  const titleProp = Object.values(page.properties).find((p) => p.type === "title");
  const title = titleProp?.title?.map((t) => t.plain_text).join("") || "제목 없음";
  return { pageId, title, text };
}
