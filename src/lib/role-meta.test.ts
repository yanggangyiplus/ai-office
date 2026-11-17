import { describe, expect, it } from "vitest";
import { MAX_ROLES, MAX_ROLE_CHARS, PRESET_ROLES, roleColor } from "./role-meta";
import * as roles from "./roles";

describe("role-meta", () => {
  it("gives every preset role its own muted colour", () => {
    const colours = PRESET_ROLES.map(roleColor);
    for (const c of colours) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    expect(new Set(colours).size).toBe(PRESET_ROLES.length);
  });
  it("gives a custom role a neutral colour and ignores case for presets", () => {
    expect(roleColor("데이터")).toMatch(/^#[0-9a-f]{6}$/i);
    expect(roleColor("qa")).toBe(roleColor("QA"));
    expect(roleColor("개발")).not.toBe(roleColor("데이터"));
  });
  it("is the same list and limits roles.ts uses", () => {
    expect(roles.PRESET_ROLES).toEqual(PRESET_ROLES);
    expect(roles.MAX_ROLES).toBe(MAX_ROLES);
    expect(roles.MAX_ROLE_CHARS).toBe(MAX_ROLE_CHARS);
  });
});
