import { describe, expect, it } from "vitest";
import { isEmailDerivedName, realFamilyName, surnameOf, tidySurname } from "@/lib/api/registration/family-name";

/**
 * CJ, 24 Sep 2026: families named after an email address ("cbay99 Family")
 * get their real name. What is pinned: the children's shared surname wins, an
 * email is never taken for a person, and no record means no guess.
 */
describe("a family's real name", () => {
  it("is the children's surname when they share one", () => {
    expect(realFamilyName({ parentNames: ["Maya Melhem"], studentLastNames: ["Wilson", "Wilson"] })).toBe("Wilson Family");
  });

  it("treats 'Rose Dickens' and 'Dickens' as one family", () => {
    expect(realFamilyName({ parentNames: [], studentLastNames: ["Rose Dickens", "Dickens"] })).toBe("Dickens Family");
  });

  it("picks the parent who matches when the children's surnames differ", () => {
    expect(
      realFamilyName({ parentNames: ["Amanda Norris", "Lachezar Manasiev"], studentLastNames: ["Norris", "Manasiev"] })
    ).toBe("Norris Family");
  });

  it("falls back to the parent, then the website's campers", () => {
    expect(realFamilyName({ parentNames: ["Scott Felder"], studentLastNames: [] })).toBe("Felder Family");
    expect(realFamilyName({ parentNames: [], studentLastNames: [], camperNames: ["Cora Kouhsari"] })).toBe("Kouhsari Family");
  });

  it("never reads an email as a name, and gives up rather than guess", () => {
    expect(surnameOf("cbay99@gmail.com")).toBe("");
    expect(realFamilyName({ parentNames: ["wales.eric@gmail.com"], studentLastNames: ["", null] })).toBeNull();
  });

  it("capitalizes a surname typed in lower case, and leaves a cased one alone", () => {
    expect(tidySurname("jones")).toBe("Jones");
    expect(tidySurname("o'leary")).toBe("O'Leary");
    expect(tidySurname("McLaughlin")).toBe("McLaughlin");
  });

  it("recognizes a name made from an email", () => {
    expect(isEmailDerivedName("cbay99 Family", ["cbay99@gmail.com"])).toBe(true);
    expect(isEmailDerivedName("Bay Family", ["cbay99@gmail.com"])).toBe(false);
  });
});
