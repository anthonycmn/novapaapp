import { describe, expect, it } from "vitest";
import { normalizeResetCode } from "@/lib/auth/reset-code";

/**
 * The six digits a parent types back to us — see lib/auth/reset-code for why a
 * code and not a link (the Watsons' mail scanner presses buttons, 11 Sep 2026).
 */
describe("a reset code typed off a phone", () => {
  it("forgives the ways people type six digits", () => {
    expect(normalizeResetCode("482913")).toBe("482913");
    expect(normalizeResetCode(" 482 913 ")).toBe("482913");
    expect(normalizeResetCode("482-913")).toBe("482913");
  });

  it("refuses anything that is not exactly six digits", () => {
    expect(normalizeResetCode("")).toBeNull();
    expect(normalizeResetCode("48291")).toBeNull();
    expect(normalizeResetCode("4829134")).toBeNull();
    expect(normalizeResetCode("abcdef")).toBeNull();
  });
});
