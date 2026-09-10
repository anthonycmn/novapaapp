import { beforeEach, describe, expect, it } from "vitest";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";
import { nullIfBlank, optionalText } from "@/lib/api/optional-text";

/**
 * Azalea Wong's name.
 *
 * Her parent, Yin, 8 Sep 2026, with a screenshot of the family's own week:
 * "it doesn't properly display Azalea's name. I suspect that you only need to
 * fix how the name is retrieved. I double checked and found that Azalea's full
 * name is already entered properly in the account."
 *
 * It was. Her preferred_name was an empty string, and the app asks for a
 * display name as `preferredName ?? firstName` in over a hundred places —
 * `??` steps past null, not past "". She rendered as a colored dot with
 * nothing beside it. Twenty-seven children were in that state.
 *
 * Yin, in the same message: "Ask AI to write the test case(s) whenever a bug is
 * fixed or a feature is developed!" So here it is, at both ends: the rule
 * itself, and the round trip through a profile save that used to create the
 * blank in the first place.
 */

/** How the app asks a student what to call them, everywhere. */
const displayName = (student: { preferredName?: string; firstName: string }) =>
  student.preferredName ?? student.firstName;

describe("blank text is absent, not a value", () => {
  it("reads nothing as nothing", () => {
    expect(optionalText(null)).toBeUndefined();
    expect(optionalText(undefined)).toBeUndefined();
    expect(optionalText("")).toBeUndefined();
    expect(optionalText("   ")).toBeUndefined();
    expect(optionalText("\n\t ")).toBeUndefined();
  });

  it("keeps a real answer, trimmed", () => {
    expect(optionalText("Azalea")).toBe("Azalea");
    expect(optionalText("  Azalea  ")).toBe("Azalea");
    // A name is not the only thing this carries; a note keeps its shape.
    expect(optionalText("peanuts, tree nuts")).toBe("peanuts, tree nuts");
  });

  it("stores a cleared box as null and leaves an untouched one alone", () => {
    expect(nullIfBlank("")).toBeNull();
    expect(nullIfBlank("   ")).toBeNull();
    expect(nullIfBlank("Azalea")).toBe("Azalea");
    // Not a string: nothing to decide, hand it back untouched.
    expect(nullIfBlank(undefined)).toBeUndefined();
    expect(nullIfBlank(false)).toBe(false);
  });

  it("gives the fallback a chance to work", () => {
    expect(displayName({ preferredName: optionalText(""), firstName: "Azalea" })).toBe(
      "Azalea"
    );
    expect(displayName({ preferredName: optionalText("Azzy"), firstName: "Azalea" })).toBe(
      "Azzy"
    );
  });
});

describe("a parent who clears the preferred-name box", () => {
  beforeEach(() => {
    resetMockStore();
  });

  const provider = new MockDataProvider();

  /** The save answers with the stored row, so read it from there. */
  const save = (preferredName: string) =>
    provider.updateStudent("user-sofia", "stu-ava", { preferredName });

  it("does not lose their child's name", async () => {
    // A nickname, then second thoughts — the exact sequence that left 27
    // children nameless on their own family's calendar.
    expect(displayName(await save("Avie"))).toBe("Avie");

    const cleared = await save("");
    expect(cleared.preferredName).toBeUndefined();
    expect(displayName(cleared)).toBe("Ava");
  });

  it("still clears it — the nickname does not come back", async () => {
    await save("Avie");
    expect((await save("   ")).preferredName).toBeUndefined();
  });
});
