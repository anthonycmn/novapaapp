import { describe, expect, it } from "vitest";
import { parseStudentProfile } from "@/lib/family/student-profile";

/**
 * The save a parent could not make.
 *
 * From 17 Aug 2026 the date-of-birth pattern was /^d{4}-d{2}-d{2}$/ — no
 * backslashes, so it matched the literal text "dddd-dd-dd" and nothing else. A
 * parent who changed a t-shirt size and pressed Save got "Enter a date of
 * birth" pointing at a date box that plainly had a date in it, and no edit to
 * any field on the page could be saved. These hold that shut.
 */

const complete = (patch: Record<string, string | undefined> = {}) => ({
  firstName: "Aubry",
  lastName: "Okafor",
  dateOfBirth: "2013-11-08",
  preferredName: "Aubs",
  pronouns: "she/her",
  grade: "7",
  school: "Kenmore MS",
  tshirtSize: "AS",
  allergies: "Peanuts — EpiPen in bag",
  medicalFlags: "",
  vocalRange: "A3–D5",
  danceExperience: "",
  auditionSongUrl: "",
  ...patch,
});

describe("the birthday a parent actually types", () => {
  it("accepts the value the date input posts", () => {
    const result = parseStudentProfile(complete());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values.dateOfBirth).toBe("2013-11-08");
  });

  it.each(["2015-03-12", "2008-01-01", "2016-02-29"])("accepts %s", (dateOfBirth) => {
    expect(parseStudentProfile(complete({ dateOfBirth })).ok).toBe(true);
  });

  it("refuses a day the calendar does not have", () => {
    // Date would roll this to 2 March and every age we derive would be off.
    const result = parseStudentProfile(complete({ dateOfBirth: "2015-02-30" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.dateOfBirth).toMatch(/calendar/i);
  });

  it("refuses a missing birthday, and says so on that field", () => {
    const result = parseStudentProfile(complete({ dateOfBirth: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.dateOfBirth).toMatch(/date of birth/i);
  });
});

describe("emptying a box a parent had filled in", () => {
  /**
   * "" has to reach the provider as "", not as undefined. The provider skips
   * undefined columns, so folding the two together turns every clearing into a
   * silent no-op — the parent deletes a stale allergy note, saves, and the note
   * comes back. Out-of-date medical text is worse than none.
   */
  it("keeps an emptied allergy note as an empty string", () => {
    const result = parseStudentProfile(complete({ allergies: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values.allergies).toBe("");
  });

  it("lets a preferred name be taken back off", () => {
    const result = parseStudentProfile(complete({ preferredName: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values.preferredName).toBe("");
  });

  it("lets the t-shirt size go back to no size on file", () => {
    const result = parseStudentProfile(complete({ tshirtSize: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values.tshirtSize).toBe("");
  });

  it("leaves a field the form never posted alone", () => {
    const result = parseStudentProfile(complete({ school: undefined }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values.school).toBeUndefined();
  });
});

describe("the fields registration matches on", () => {
  it("requires a legal first and last name", () => {
    const result = parseStudentProfile(complete({ firstName: "  ", lastName: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.firstName).toMatch(/first name/i);
      expect(result.errors.lastName).toMatch(/last name/i);
    }
  });

  it("requires a grade", () => {
    const result = parseStudentProfile(complete({ grade: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.grade).toMatch(/grade/i);
  });
});

describe("the audition song link", () => {
  it("takes a full URL", () => {
    const result = parseStudentProfile(
      complete({ auditionSongUrl: "https://youtu.be/abc123" })
    );
    expect(result.ok).toBe(true);
  });

  it("refuses something that is not a URL, on that field", () => {
    const result = parseStudentProfile(complete({ auditionSongUrl: "my song" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.auditionSongUrl).toMatch(/full URL/i);
  });

  it("accepts an emptied link so it can be removed", () => {
    expect(parseStudentProfile(complete({ auditionSongUrl: "" })).ok).toBe(true);
  });
});
