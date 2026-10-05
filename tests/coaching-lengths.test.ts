import { describe, expect, it } from "vitest";
import { lengthsOf } from "@/lib/api/coaching/assemble";

/**
 * Which lesson lengths a coach offers families (portal 0337): thirty, fifty,
 * or both. The parent portal shows a length chooser only when there are two,
 * and every booking must use one of these — so a stray value here is a
 * button the database will refuse.
 */
describe("lengthsOf", () => {
  it("reads both lengths, shortest first, without repeats", () => {
    expect(lengthsOf([50, 30, 30], 50)).toEqual([30, 50]);
  });

  it("drops anything that is not a real lesson length", () => {
    expect(lengthsOf([45, 50], 50)).toEqual([50]);
  });

  it("falls back to the coach's single length when the view predates 0337", () => {
    expect(lengthsOf(undefined, 30)).toEqual([30]);
    expect(lengthsOf([], 50)).toEqual([50]);
  });
});
