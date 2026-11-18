// Shared by the server logic and the browser cards (no database imports here).
export const ITEM_KINDS = ["rule", "notice", "link"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const MAX_ITEM_CHARS = 300;
export const MAX_PER_KIND = 30;
export const MAX_TODAY_CHARS = 100;

export type TeamItem = { id: string; kind: ItemKind; title: string; url: string | null; authorName: string; mine: boolean; at: number };
