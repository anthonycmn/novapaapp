import { describe, expect, it } from "vitest";
import { readResetLink, spentLinkPlan } from "./reset-link";

const RECOVERY = "?token_hash=abc123&type=recovery";
const SPENT_HASH = "#error=access_denied&error_description=Email+link+is+invalid+or+has+expired";

describe("readResetLink", () => {
  it("holds the scanner-proof token without spending it", () => {
    expect(readResetLink({ search: RECOVERY, hash: "", signedIn: false })).toEqual({
      kind: "unspent",
      tokenHash: "abc123",
    });
  });

  it("holds it even when they are already signed in, because the link may be good", () => {
    // Somebody signed in on another tab can still be setting a new password.
    // Only a link that cannot be spent changes its ending.
    expect(readResetLink({ search: RECOVERY, hash: "", signedIn: true })).toEqual({
      kind: "unspent",
      tokenHash: "abc123",
    });
  });

  it("ignores a token_hash that is not a recovery link", () => {
    const plan = readResetLink({
      search: "?token_hash=abc123&type=invite",
      hash: "",
      signedIn: false,
    });
    expect(plan.kind).toBe("await_session");
  });

  it("waits for the stock link's session rather than judging it early", () => {
    expect(readResetLink({ search: "", hash: "", signedIn: false }).kind).toBe("await_session");
  });

  it("calls a spent link spent when nobody is signed in", () => {
    expect(readResetLink({ search: "", hash: SPENT_HASH, signedIn: false }).kind).toBe("spent");
  });

  it("calls a spent link finished when the browser holds a session", () => {
    expect(readResetLink({ search: "", hash: SPENT_HASH, signedIn: true }).kind).toBe(
      "already_signed_in"
    );
  });

  it("reads an error_description on its own as a failure", () => {
    const plan = readResetLink({
      search: "",
      hash: "#error_description=Email+link+is+invalid+or+has+expired",
      signedIn: false,
    });
    expect(plan.kind).toBe("spent");
  });
});

/**
 * Jennifer Atkinson, 20 Sep 2026. Link at 4:00:00 PM ET, signed in with it at
 * 4:00:13, pressed it again at 4:00:16 and was told it had expired, then asked
 * for three more links in three seconds and was rate limited on every one.
 * She was signed in the whole time.
 */
describe("spentLinkPlan", () => {
  it("sends a signed-in family on rather than telling them they are locked out", () => {
    expect(spentLinkPlan(true).kind).toBe("already_signed_in");
  });

  it("still offers a fresh link to somebody who really is locked out", () => {
    expect(spentLinkPlan(false).kind).toBe("spent");
  });
});
