import { describe, expect, it } from "vitest";
import { describeRoles, staffForFamily } from "@/lib/api/staff/for-family";
import type {
  ClassOffering,
  Enrollment,
  Production,
  StaffProfile,
  Student,
} from "@/lib/api/types";

/**
 * "Our staff" is a subtraction: fifteen colleagues and twenty-four shows have
 * to become the four people in the room with THIS family's children. Getting
 * it wrong in either direction is bad — a directory buries the answer, and a
 * missing teacher is a parent who cannot find out who runs the class.
 */

const profile = (id: string, fullName: string, patch: Partial<StaffProfile> = {}): StaffProfile => ({
  id,
  fullName,
  title: "Teaching Artist",
  bio: "",
  specialties: [],
  isPublished: true,
  ...patch,
});

const student = (id: string, firstName: string, familyId = "fam-1"): Student =>
  ({ id, familyId, firstName, lastName: "Martinez", dateOfBirth: "2015-01-01" }) as Student;

const enrollment = (
  studentId: string,
  target: { productionId?: string; classId?: string },
  status: Enrollment["status"] = "enrolled"
): Enrollment =>
  ({ id: `enr-${studentId}-${target.productionId ?? target.classId}`, studentId, status, balanceCents: 0, ...target }) as Enrollment;

const production = (id: string, title: string, directorStaffId?: string): Production =>
  ({ id, title, directorStaffId, programId: "p", seasonId: "s", venue: "NCC" }) as Production;

const offering = (id: string, name: string, staffIds: string[]): ClassOffering =>
  ({ id, name, staffIds, programId: "p", dayOfWeek: 2, startTime: "16:30", endTime: "17:30", location: "Studio A" }) as ClassOffering;

const base = {
  students: [student("stu-ava", "Ava")],
  productions: [production("prod-frozen", "Frozen, Kids")],
  classes: [offering("cls-acting", "Acting (9 – 12 yrs)", ["staff-priya"])],
  profiles: [
    profile("staff-ryyana", "Ryyana Cunningham"),
    profile("staff-priya", "Priya Raman"),
    profile("staff-dana", "Dana Whitfield"),
  ],
};

describe("only the people in the room", () => {
  it("returns the show's team when the child is in the show", () => {
    const result = staffForFamily({
      ...base,
      enrollments: [enrollment("stu-ava", { productionId: "prod-frozen" })],
      productionStaff: [
        { productionId: "prod-frozen", staffId: "staff-ryyana", role: "Vocal Director" },
      ],
    });
    expect(result.map((a) => a.profile.fullName)).toEqual(["Ryyana Cunningham"]);
  });

  it("leaves out the team of a show the child is NOT in", () => {
    // Dana runs another show entirely. That is the whole point of this page.
    const result = staffForFamily({
      ...base,
      productions: [
        production("prod-frozen", "Frozen, Kids"),
        production("prod-other", "Mean Girls"),
      ],
      enrollments: [enrollment("stu-ava", { productionId: "prod-frozen" })],
      productionStaff: [
        { productionId: "prod-frozen", staffId: "staff-ryyana", role: "Vocal Director" },
        { productionId: "prod-other", staffId: "staff-dana", role: "Director" },
      ],
    });
    expect(result.map((a) => a.profile.id)).toEqual(["staff-ryyana"]);
  });

  it("includes the teacher of a class the child is in", () => {
    const result = staffForFamily({
      ...base,
      enrollments: [enrollment("stu-ava", { classId: "cls-acting" })],
      productionStaff: [],
    });
    expect(result.map((a) => a.profile.fullName)).toEqual(["Priya Raman"]);
    expect(result[0].roles[0].href).toBe("/classes/cls-acting");
  });

  it("drops a withdrawn enrolment — that is not a room your child is in", () => {
    const result = staffForFamily({
      ...base,
      enrollments: [enrollment("stu-ava", { productionId: "prod-frozen" }, "withdrawn")],
      productionStaff: [
        { productionId: "prod-frozen", staffId: "staff-ryyana", role: "Vocal Director" },
      ],
    });
    expect(result).toEqual([]);
  });

  it("never leaks another family's child", () => {
    // An enrolment for a student who is not ours contributes nobody, and
    // certainly not a name.
    const result = staffForFamily({
      ...base,
      enrollments: [enrollment("stu-someone-else", { productionId: "prod-frozen" })],
      productionStaff: [
        { productionId: "prod-frozen", staffId: "staff-ryyana", role: "Vocal Director" },
      ],
    });
    expect(result).toEqual([]);
  });
});

describe("one person, however many jobs", () => {
  const threeJobs = {
    ...base,
    enrollments: [enrollment("stu-ava", { productionId: "prod-frozen" })],
    productionStaff: [
      { productionId: "prod-frozen", staffId: "staff-ryyana", role: "Vocal Director" },
      { productionId: "prod-frozen", staffId: "staff-ryyana", role: "Costume Designer" },
      { productionId: "prod-frozen", staffId: "staff-ryyana", role: "Hair / Make-Up Designer" },
    ],
  };

  it("shows one card, not three", () => {
    const result = staffForFamily(threeJobs);
    expect(result).toHaveLength(1);
    expect(result[0].roles).toHaveLength(3);
  });

  it("groups the jobs under the show rather than repeating the title", () => {
    expect(describeRoles(staffForFamily(threeJobs)[0])).toBe(
      "Costume Designer · Hair / Make-Up Designer · Vocal Director on Frozen, Kids"
    );
  });

  it("says 'Teaches' for a class, where the job needs no name", () => {
    const result = staffForFamily({
      ...base,
      enrollments: [enrollment("stu-ava", { classId: "cls-acting" })],
      productionStaff: [],
    });
    expect(describeRoles(result[0])).toBe("Teaches Acting (9 – 12 yrs)");
  });

  it("puts the most-involved person first", () => {
    const result = staffForFamily({
      ...base,
      enrollments: [enrollment("stu-ava", { productionId: "prod-frozen" })],
      productionStaff: [
        { productionId: "prod-frozen", staffId: "staff-dana", role: "Director" },
        { productionId: "prod-frozen", staffId: "staff-ryyana", role: "Vocal Director" },
        { productionId: "prod-frozen", staffId: "staff-ryyana", role: "Costume Designer" },
      ],
    });
    expect(result.map((a) => a.profile.fullName)).toEqual([
      "Ryyana Cunningham",
      "Dana Whitfield",
    ]);
  });
});

describe("the director, who is recorded on the show itself", () => {
  it("is included even with no row in the assignment table", () => {
    const result = staffForFamily({
      ...base,
      productions: [production("prod-frozen", "Frozen, Kids", "staff-dana")],
      enrollments: [enrollment("stu-ava", { productionId: "prod-frozen" })],
      productionStaff: [],
    });
    expect(describeRoles(result[0])).toBe("Director on Frozen, Kids");
  });

  it("is not listed twice when they also hold an assignment row", () => {
    const result = staffForFamily({
      ...base,
      productions: [production("prod-frozen", "Frozen, Kids", "staff-dana")],
      enrollments: [enrollment("stu-ava", { productionId: "prod-frozen" })],
      productionStaff: [
        { productionId: "prod-frozen", staffId: "staff-dana", role: "Director & Vocal Director" },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].roles).toHaveLength(1);
  });
});

describe("which of your children meets them", () => {
  it("names each child once, however many jobs the person holds", () => {
    const result = staffForFamily({
      ...base,
      students: [student("stu-ava", "Ava"), student("stu-leo", "Leo")],
      enrollments: [
        enrollment("stu-ava", { productionId: "prod-frozen" }),
        enrollment("stu-leo", { productionId: "prod-frozen" }),
      ],
      productionStaff: [
        { productionId: "prod-frozen", staffId: "staff-ryyana", role: "Vocal Director" },
        { productionId: "prod-frozen", staffId: "staff-ryyana", role: "Costume Designer" },
      ],
    });
    expect(result[0].roles[0].studentNames).toEqual(["Ava", "Leo"]);
  });

  it("prefers the name the child actually goes by", () => {
    const result = staffForFamily({
      ...base,
      students: [{ ...student("stu-ava", "Avaline"), preferredName: "Ava" } as Student],
      enrollments: [enrollment("stu-ava", { classId: "cls-acting" })],
      productionStaff: [],
    });
    expect(result[0].roles[0].studentNames).toEqual(["Ava"]);
  });
});

describe("gaps in the bridge", () => {
  it("does not invent a colleague from an assignment with no profile", () => {
    // A staff_id with no staff_profiles row is a bridge gap, not a person.
    const result = staffForFamily({
      ...base,
      enrollments: [enrollment("stu-ava", { productionId: "prod-frozen" })],
      productionStaff: [
        { productionId: "prod-frozen", staffId: "staff-nobody", role: "Director" },
      ],
    });
    expect(result).toEqual([]);
  });

  it("keeps an unpublished profile in the list — the page gates the bio", () => {
    // A family meets this person every week; what approval gates is the bio
    // and the photo, not their existence.
    const result = staffForFamily({
      ...base,
      profiles: [profile("staff-ryyana", "Ryyana Cunningham", { isPublished: false })],
      enrollments: [enrollment("stu-ava", { productionId: "prod-frozen" })],
      productionStaff: [
        { productionId: "prod-frozen", staffId: "staff-ryyana", role: "Vocal Director" },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].profile.isPublished).toBe(false);
  });

  it("copes with a family enrolled in nothing", () => {
    expect(
      staffForFamily({ ...base, enrollments: [], productionStaff: [] })
    ).toEqual([]);
  });
});
