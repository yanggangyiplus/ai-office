// Role facts that screens need. Kept free of server imports so client code can use it.
export const PRESET_ROLES = ["PO", "기획", "디자인", "개발", "마케팅", "QA"];
export const MAX_ROLES = 5;
export const MAX_ROLE_CHARS = 12;

const COLORS: Record<string, string> = {
  po: "#5b6b9a",
  기획: "#6f9a86",
  디자인: "#b0728f",
  개발: "#4a7bd0",
  마케팅: "#cf8a4a",
  qa: "#7d8794",
};
const CUSTOM = "#8a8f99";

export const roleColor = (role: string): string => COLORS[role.trim().toLowerCase()] ?? CUSTOM;
