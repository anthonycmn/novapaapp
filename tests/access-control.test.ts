import { beforeEach, describe, expect, it } from "vitest";
import { AccessDeniedError } from "@/lib/api/provider";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";

/**
 * Access-control tests — the Phase 0 verification requirement:
 * "RLS blocks cross-family reads (write a test proving it)."
 *
 * The mock adapter enforces the same rules as the RLS policies in
 * supabase/migrations/0001_foundation.sql; these tests pin the behavior.
 *
 * Actors (from seed data):
 *   user-sofia  — parent, fam-martinez (students: Ava, Leo)
 *   user-ngozi  — parent, fam-okafor  (students: Chidi, Amara)
 *   user-chidi  — student (13+), fam-okafor
 *   user-marcus — staff
 *   user-dana   — admin
 */

const provider = new MockDataProvider();

beforeEach(() => {
  resetMockStore();
});

describe("cross-family isolation", () => {
  it("a parent cannot read another family's record", async () => {
    await expect(provider.getFamily("user-sofia", "fam-okafor")).rejects.toThrow(
      AccessDeniedError
    );
  });

  it("a parent cannot list another family's students", async () => {
    await expect(
      provider.getStudentsForFamily("user-sofia", "fam-okafor")
    ).rejects.toThrow(AccessDeniedError);
  });

  it("a parent cannot read another family's student directly", async () => {
    await expect(provider.getStudent("user-sofia", "stu-chidi")).rejects.toThrow(
      AccessDeniedError
    );
  });

  it("a parent cannot update another family's student", async () => {
    await expect(
      provider.updateStudent("user-sofia", "stu-chidi", { grade: "9" })
    ).rejects.toThrow(AccessDeniedError);
  });

  it("a parent cannot read another family's enrollments or guardians", async () => {
    await expect(
      provider.getEnrollmentsForFamily("user-sofia", "fam-okafor")
    ).rejects.toThrow(AccessDeniedError);
    await expect(provider.getGuardians("user-sofia", "fam-okafor")).rejects.toThrow(
      AccessDeniedError
    );
  });

  it("a student cannot read a different family's data", async () => {
    await expect(provider.getStudent("user-chidi", "stu-ava")).rejects.toThrow(
      AccessDeniedError
    );
  });
});

describe("hopes fields privacy (feature #4)", () => {
  it("another family can NEVER read a student's hopes", async () => {
    await expect(provider.getHopes("user-ngozi", "stu-ava")).rejects.toThrow(
      AccessDeniedError
    );
  });

  it("the student's own parent can read both hopes entries", async () => {
    const hopes = await provider.getHopes("user-sofia", "stu-ava");
    expect(hopes.length).toBe(2);
  });

  it("staff and admin can read hopes (pre-casting review)", async () => {
    const asStaff = await provider.getHopes("user-marcus", "stu-ava");
    const asAdmin = await provider.getHopes("user-dana", "stu-ava");
    expect(asStaff.length).toBe(2);
    expect(asAdmin.length).toBe(2);
  });

  it("a student sees parent hopes only when the parent shared them", async () => {
    // Seed: hope-1 (parent, visibleToStudent=false), hope-2 (student).
    // Chidi (student role, fam-okafor) has no hopes; use Ava's family via a
    // hypothetical student login — simulate by writing hopes for Chidi.
    await provider.upsertHopes("user-ngozi", "stu-chidi", {
      seasonId: "season-2627",
      author: "parent",
      text: "Private parent hope",
      visibleToStudent: false,
    });
    const visible = await provider.getHopes("user-chidi", "stu-chidi");
    expect(visible.some((h) => h.text === "Private parent hope")).toBe(false);
  });

  it("staff cannot write hopes — they belong to families", async () => {
    await expect(
      provider.upsertHopes("user-marcus", "stu-ava", {
        seasonId: "season-2627",
        author: "parent",
        text: "staff should not write this",
      })
    ).rejects.toThrow(AccessDeniedError);
  });
});

describe("staff-only fields", () => {
  it("parents do not receive staffNotes on their own family", async () => {
    const family = await provider.getFamily("user-sofia", "fam-martinez");
    expect(family?.staffNotes).toBeUndefined();
  });

  it("staff do receive staffNotes", async () => {
    const family = await provider.getFamily("user-marcus", "fam-martinez");
    expect(family?.staffNotes).toBeTruthy();
  });

  it("parents cannot write staffNotes", async () => {
    await provider.updateFamily("user-sofia", "fam-martinez", {
      staffNotes: "parent trying to write staff notes",
    } as never);
    const asStaff = await provider.getFamily("user-dana", "fam-martinez");
    expect(asStaff?.staffNotes).not.toContain("parent trying");
  });
});

describe("staff/admin access", () => {
  it("staff can read any family (program scoping tightens in Phase 1)", async () => {
    const family = await provider.getFamily("user-marcus", "fam-okafor");
    expect(family?.name).toBe("The Okafor Family");
  });

  it("admin can read any student", async () => {
    const student = await provider.getStudent("user-dana", "stu-lien");
    expect(student?.firstName).toBe("Liên");
  });
});

describe("write rules mirror RLS", () => {
  it("staff cannot update a family or student (read-only; admin can)", async () => {
    await expect(
      provider.updateFamily("user-marcus", "fam-martinez", { city: "Reston" })
    ).rejects.toThrow(AccessDeniedError);
    await expect(
      provider.updateStudent("user-marcus", "stu-ava", { grade: "6" })
    ).rejects.toThrow(AccessDeniedError);
    const updated = await provider.updateStudent("user-dana", "stu-ava", { grade: "6" });
    expect(updated.grade).toBe("6");
  });
});

describe("pre-casting review", () => {
  it("is staff-only — parents cannot pull the review for a production", async () => {
    await expect(
      provider.getCastingReview("user-sofia", "prod-frozen")
    ).rejects.toThrow(AccessDeniedError);
  });

  it("gives staff every enrolled student with hopes", async () => {
    const review = await provider.getCastingReview("user-dana", "prod-frozen");
    const ava = review.find((r) => r.student.id === "stu-ava");
    expect(ava).toBeDefined();
    expect(ava!.hopes.length).toBe(2);
  });
});

describe("casting visibility", () => {
  it("families only see published casting", async () => {
    const casting = await provider.getCastingForStudent("user-sofia", "stu-ava");
    expect(casting.every((c) => c.publishedAt)).toBe(true);
  });
});
