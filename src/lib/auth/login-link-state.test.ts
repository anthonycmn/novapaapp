import { describe, expect, it } from "vitest";
import { loginLinkState, looksLikeLoginToken } from "./login-link-state";

describe("loginLinkState", () => {
  const now = new Date("2026-09-09T16:00:00Z");

  it("is ready while unused and in date", () => {
    expect(loginLinkState({ expiresAt: "2026-09-16T16:00:00Z", usedAt: null }, now)).toBe("ready");
  });

  it("is used once stamped, even if still in date", () => {
    expect(
      loginLinkState({ expiresAt: "2026-09-16T16:00:00Z", usedAt: "2026-09-10T00:00:00Z" }, now)
    ).toBe("used");
  });

  it("is expired at the boundary and after it", () => {
    expect(loginLinkState({ expiresAt: now, usedAt: null }, now)).toBe("expired");
    expect(loginLinkState({ expiresAt: "2026-09-01T00:00:00Z", usedAt: null }, now)).toBe("expired");
  });

  it("treats an unreadable expiry as expired rather than open", () => {
    expect(loginLinkState({ expiresAt: "not a date", usedAt: null }, now)).toBe("expired");
  });
});

describe("looksLikeLoginToken", () => {
  it("accepts the 43-character base64url newToken() produces", () => {
    expect(looksLikeLoginToken("A".repeat(43))).toBe(true);
    expect(looksLikeLoginToken("ab-_" + "x".repeat(39))).toBe(true);
  });

  it("rejects paths that could never be one of ours", () => {
    expect(looksLikeLoginToken("")).toBe(false);
    expect(looksLikeLoginToken("short")).toBe(false);
    expect(looksLikeLoginToken("has/slash" + "x".repeat(40))).toBe(false);
    expect(looksLikeLoginToken("x".repeat(65))).toBe(false);
  });
});
