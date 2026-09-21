import { describe, expect, it } from "vitest";
import { looksLikeEmailAddress, realFirstName, realName } from "@/lib/names";
import { resolveMergeFields } from "@/lib/api/email";

/**
 * "Hi aydenfelder6@gmail.com,"
 *
 * The Sep 21 2026 parent portal audit counted 176 of 815 parent profiles whose
 * `display_name` is their email address, and found three delivery paths and
 * the sidebar all reading it as a name. Nothing had shipped yet: zero sends
 * had used `{{parent_first}}`, so this is the test that keeps it that way.
 *
 * The rule the audit asked for, and the only surprising part of it: when
 * there is no name, the answer is nothing. Not the address, and not the part
 * of the address in front of the `@`.
 */
describe("an address is not a name", () => {
  it("knows an address when it sees one", () => {
    expect(looksLikeEmailAddress("aydenfelder6@gmail.com")).toBe(true);
    expect(looksLikeEmailAddress("Marisa Skelton")).toBe(false);
    expect(looksLikeEmailAddress("")).toBe(false);
    expect(looksLikeEmailAddress(null)).toBe(false);
    expect(looksLikeEmailAddress(undefined)).toBe(false);
  });

  it("returns nothing rather than the address", () => {
    expect(realName({ displayName: "aydenfelder6@gmail.com" })).toBe("");
    expect(realFirstName({ displayName: "aydenfelder6@gmail.com" })).toBe("");
  });

  it("never falls back to the local part of the address", () => {
    expect(realFirstName({ displayName: "aydenfelder6@gmail.com" })).not.toBe("aydenfelder6");
  });

  it("prefers the guardian row over the display name", () => {
    expect(
      realName({ displayName: "clarkecm79@gmail.com", guardianName: "Marisa Skelton" })
    ).toBe("Marisa Skelton");
    expect(
      realFirstName({ displayName: "clarkecm79@gmail.com", guardianName: "Marisa Skelton" })
    ).toBe("Marisa");
    // The guardian row is the one the family can edit, so it wins even when
    // the display name is a perfectly good name.
    expect(realName({ displayName: "M. Skelton", guardianName: "Marisa Skelton" })).toBe(
      "Marisa Skelton"
    );
  });

  it("falls back to the display name when there is no guardian row", () => {
    expect(realName({ displayName: "Marisa Skelton", guardianName: null })).toBe(
      "Marisa Skelton"
    );
    expect(realFirstName({ displayName: "Marisa Skelton" })).toBe("Marisa");
  });

  it("refuses an address in the guardian row too", () => {
    expect(
      realName({ displayName: "Marisa Skelton", guardianName: "clarkecm79@gmail.com" })
    ).toBe("Marisa Skelton");
    expect(
      realName({ displayName: "clarkecm79@gmail.com", guardianName: "mjskelton@yahoo.com" })
    ).toBe("");
  });

  it("treats blank and whitespace as absent, and trims what it keeps", () => {
    expect(realName({ displayName: "", guardianName: "" })).toBe("");
    expect(realName({ displayName: "   ", guardianName: "  " })).toBe("");
    expect(realName({ displayName: "  Marisa Skelton  " })).toBe("Marisa Skelton");
    expect(realFirstName({})).toBe("");
  });

  it("puts no address into a greeting, and no em dash either", () => {
    const greeting = resolveMergeFields("Hi {{parent_first}},", {
      parent_first: realFirstName({ displayName: "aydenfelder6@gmail.com" }),
    });
    expect(greeting).not.toContain("@");
    // An undefined merge field renders as an em dash; an empty one must not,
    // because the house rule is nowhere and a family reads this line.
    expect(greeting).not.toContain("\u2014");
    // The residual, stated rather than hidden: a parent with no guardian row
    // and an address for a display name gets a greeting with a gap in it.
    // That is the audit's call and the right one. "Hi ," is a greeting that
    // forgot a name; "Hi aydenfelder6@gmail.com," is a greeting to an inbox.
    expect(greeting).toBe("Hi ,");
  });
});
