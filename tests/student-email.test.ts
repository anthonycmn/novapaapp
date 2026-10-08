import { describe, expect, it } from "vitest";
import { parseStudentProfile } from "@/lib/family/student-profile";
import { studentRecipients, type StudentForEmail } from "@/lib/email/student-recipients";
import { keepSubscribed } from "@/lib/email/opt-outs";
import type { User } from "@/lib/api/types";

/**
 * Students copied on staff emails — CJ, 5 Oct 2026, from Jen Travis. A parent
 * gives the address; the sender ticks "Also send to students".
 */

const base = { firstName: "Aubry", lastName: "Okafor", dateOfBirth: "2013-11-08", grade: "7" };

describe("the student's email on the profile form", () => {
  it("takes a real address and lets a parent clear it", () => {
    expect(parseStudentProfile({ ...base, email: "aubry@example.com" }).ok).toBe(true);
    const cleared = parseStudentProfile({ ...base, email: "" });
    expect(cleared.ok && cleared.values.email).toBe("");
  });

  it("refuses something that is not an address", () => {
    const parsed = parseStudentProfile({ ...base, email: "aubry at gmail" });
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.errors.email).toMatch(/email address/);
  });
});

const student = (id: string, familyId: string, email?: string, extra: Partial<StudentForEmail> = {}): StudentForEmail => ({
  id, familyId, firstName: id, lastName: "Kid", email, createdAt: "2026-01-01", ...extra,
});
const parent = (email: string, familyId: string): User => ({
  id: `p-${email}`, email, displayName: "Pat Parent", role: "parent", familyId, createdAt: "2026-01-01",
});
const programOf = { classes: new Map<string, string | null>(), productions: new Map<string, string | null>() };

describe("which students are copied", () => {
  const students = [
    student("ava", "f1", "Ava@Example.com"),
    student("ben", "f1"), // no address — never copied
    student("cy", "f2", "cy@example.com"),
    student("dee", "f3", "shared@example.com"),
  ];
  const enrollments = [
    { studentId: "ava", productionId: "sweeney" },
    { studentId: "ben", productionId: "frozen" },
    { studentId: "cy", classId: "tap" },
  ];

  it("copies nobody unless the sender asks", () => {
    expect(studentRecipients({ productionIds: ["sweeney"] }, students, enrollments, programOf, [])).toEqual([]);
  });

  it("goes by the student's own enrollment, not a sibling's", () => {
    const out = studentRecipients(
      { productionIds: ["frozen"], includeStudents: true }, students, enrollments, programOf, []
    );
    // Ben is in Frozen but has no address; Ava, his sister, is not in Frozen.
    expect(out).toEqual([]);
  });

  it("copies the show's students as student recipients, lowercased", () => {
    const out = studentRecipients(
      { productionIds: ["sweeney"], classIds: ["tap"], includeStudents: true },
      students, enrollments, programOf, []
    );
    expect(out.map((r) => [r.id, r.email, r.role])).toEqual([
      ["ava", "ava@example.com", "student"],
      ["cy", "cy@example.com", "student"],
    ]);
  });

  it("never sends one address twice", () => {
    const out = studentRecipients(
      { includeStudents: true }, students, enrollments, programOf, [parent("shared@example.com", "f3")]
    );
    expect(out.map((r) => r.id)).toEqual(["ava", "cy"]);
  });

  it("a student's own unsubscribe stops newsletters, never critical mail", () => {
    const optedOut = studentRecipients(
      { includeStudents: true },
      [student("eve", "f4", "eve@example.com", { emailOptedOut: true })],
      [], programOf, []
    );
    expect(keepSubscribed(optedOut, new Set(), "newsletter")).toEqual([]);
    expect(keepSubscribed(optedOut, new Set(), "critical")).toHaveLength(1);
  });
});
