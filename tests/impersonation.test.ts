import { beforeAll, describe, expect, it } from "vitest";

/**
 * The parts of impersonation that are load-bearing.
 *
 * Not the routes — those need Supabase. What is worth pinning down is the
 * cookie: it is the only thing standing between a parent and a marker that
 * says a Chief is present, and the only thing that makes the window expire.
 * If it can be forged or outlived, every guard downstream is decoration.
 */

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-for-impersonation-only";
});

async function mod() {
  return import("@/lib/auth/impersonation-token");
}

const sample = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "11111111-2222-3333-4444-555555555555",
  actorEmail: "cj@novapa.org",
  actorName: "CJ Cimino-Johnson",
  expiresAt: Date.now() + 60_000,
  ...over,
});

describe("the marker cookie", () => {
  it("round-trips what was put in it", async () => {
    const { encodeImpersonation, decodeImpersonation } = await mod();
    const value = sample();
    expect(decodeImpersonation(encodeImpersonation(value))).toEqual(value);
  });

  it("refuses a payload somebody edited", async () => {
    const { encodeImpersonation, decodeImpersonation } = await mod();
    const raw = encodeImpersonation(sample());
    const [body, sig] = raw.split(".");
    // Same signature, different body — a parent minting themselves an
    // impersonation, or a Chief extending their own window.
    const tampered = Buffer.from(
      JSON.stringify(sample({ actorEmail: "someone@else.org" }))
    ).toString("base64url");
    expect(body).not.toBe(tampered);
    expect(decodeImpersonation(`${tampered}.${sig}`)).toBeNull();
  });

  it("refuses a signature from a different secret", async () => {
    const { decodeImpersonation } = await mod();
    const body = Buffer.from(JSON.stringify(sample())).toString("base64url");
    expect(decodeImpersonation(`${body}.not-a-real-signature`)).toBeNull();
  });

  it("treats an expired marker as no impersonation at all", async () => {
    const { encodeImpersonation, decodeImpersonation } = await mod();
    // Correctly signed, simply out of time. This is what makes the window a
    // window rather than a suggestion.
    const stale = encodeImpersonation(sample({ expiresAt: Date.now() - 1 }));
    expect(decodeImpersonation(stale)).toBeNull();
  });

  it("refuses junk without throwing", async () => {
    const { decodeImpersonation } = await mod();
    for (const junk of ["", ".", "no-dot", "a.b.c", "...."]) {
      expect(decodeImpersonation(junk)).toBeNull();
    }
  });
});

describe("the one-time entry token", () => {
  it("is long, random, and never repeats", async () => {
    const { newToken } = await mod();
    const seen = new Set(Array.from({ length: 200 }, () => newToken()));
    expect(seen.size).toBe(200);
    expect([...seen][0].length).toBeGreaterThanOrEqual(40);
  });

  it("is stored only as a hash", async () => {
    const { hashToken, newToken } = await mod();
    const token = newToken();
    const hash = hashToken(token);
    // 64 hex characters, and nothing of the token itself left in it.
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashToken(token)).toBe(hash);
    expect(hashToken(newToken())).not.toBe(hash);
  });

  it("expires far sooner than the session it opens", async () => {
    const { tokenTtlSeconds, sessionTtlMinutes } = await mod();
    // A link that lives as long as the session is a link worth stealing.
    expect(tokenTtlSeconds).toBeLessThanOrEqual(300);
    expect(tokenTtlSeconds).toBeLessThan(sessionTtlMinutes * 60);
  });
});

describe("what may never be done in somebody else's shoes", () => {
  it("is exactly the four CJ named", async () => {
    const { BLOCKED_ACTIONS } = await mod();
    // Pinned deliberately. Adding a fifth is fine; removing one of these is a
    // decision that should have to edit this line and explain itself.
    expect(Object.keys(BLOCKED_ACTIONS).sort()).toEqual([
      "document",
      "health",
      "pickup",
      "store",
    ]);
  });
});
