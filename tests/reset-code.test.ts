import { describe, expect, it } from "vitest";
import { normalizeResetCode } from "@/lib/auth/reset-code";

/**
 * The code a parent types back to us — see lib/auth/reset-code for why a code
 * and not a link (the Watsons' mail scanner presses buttons, 11 Sep 2026), and
 * why its length is Supabase's to decide (eight digits today; the six this
 * test used to insist on locked out every parent who reset, 13 Sep 2026).
 */
describe("a reset code typed off a phone", () => {
  it("accepts the eight digits Supabase actually sends", () => {
    expect(normalizeResetCode("48291375")).toBe("48291375");
    expect(normalizeResetCode(" 4829 1375 ")).toBe("48291375");
    expect(normalizeResetCode("4829-1375")).toBe("48291375");
  });

  it("accepts any length Supabase can be configured to, six through ten", () => {
    expect(normalizeResetCode("482913")).toBe("482913");
    expect(normalizeResetCode("4829137501")).toBe("4829137501");
  });

  it("refuses what cannot be a code at all", () => {
    expect(normalizeResetCode("")).toBeNull();
    expect(normalizeResetCode("48291")).toBeNull();
    expect(normalizeResetCode("48291375012")).toBeNull();
    expect(normalizeResetCode("abcdef")).toBeNull();
  });
});
