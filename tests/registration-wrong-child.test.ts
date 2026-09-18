import { reconcile } from "@/lib/api/registration/reconcile";
import * as seed from "@/lib/api/mock/seed-data";
import { describe, expect, it } from "vitest";

/**
 * The Stuermann case, 18 Sep 2026.
 *
 * Two registrations bought for Kai sat on his sister Vanessa's enrollments,
 * carrying his line items (legacy:778 Sweeney Todd, legacy:790 Hadestown).
 * Every 15 minutes the sync resolved Kai, found no enrollment of his, and
 * tried to create one, and the unique index on (external_source, external_id)
 * threw 23505: 192 failures in 24 hours, forever, and a run that could never
 * report anything but "partial".
 *
 * The rule now: a line item another enrollment already holds is never
 * recreated. It is reported, by name, so somebody can move it.
 */
describe("a registration another child's enrollment already holds", () => {
  const production = seed.productions[0];
  const family = seed.families[0];
  const vanessa = { ...seed.students[0], id: "stu-vanessa", familyId: family.id, firstName: "Vanessa", lastName: "Stuermann" };
  const kai = { ...seed.students[0], id: "stu-kai", familyId: family.id, firstName: "Kai", lastName: "Stuermann" };

  const base = {
    families: [family],
    guardians: [{ ...seed.guardians[0], email: "p@example.com", familyId: family.id }],
    students: [vanessa, kai],
    productions: seed.productions,
    classes: seed.classes,
    links: [],
    enrollments: [
      {
        ...seed.enrollments[0],
        id: "enr-vanessa",
        studentId: vanessa.id,
        productionId: production.id,
        classId: undefined,
        status: "enrolled" as const,
        balanceCents: 0,
      },
    ],
    // The row was made by the sync from Kai's line item, and put on Vanessa.
    enrollmentExternalIds: new Map([["enr-vanessa", "legacy:778"]]),
  };

  const snapshot = {
    accounts: [{ externalId: "acct-1", source: "website" as const, guardianName: "P", email: "p@example.com" }],
    participants: [
      { externalId: "part-kai", accountExternalId: "acct-1", firstName: "Kai", lastName: "Stuermann" },
    ],
    enrollments: [
      {
        externalId: "legacy:778",
        source: "website" as const,
        participantExternalId: "part-kai",
        accountExternalId: "acct-1",
        offeringName: production.title,
        offeringCategory: "camp",
        status: "enrolled" as const,
        balanceCents: 0,
        amountPaidCents: 89500,
        enrolledAt: "2026-08-15T00:00:00.000Z",
      },
    ],
    fetchedAt: "2026-09-18T10:45:00.000Z",
    source: "website" as const,
  };

  it("is never created a second time", () => {
    const plan = reconcile({ ...base, snapshot });
    expect(plan.creates.find((c) => c.externalId === "legacy:778")).toBeUndefined();
    expect(plan.counts.enrollmentsCreated).toBe(0);
  });

  it("is reported, naming the child it is for and the child holding it", () => {
    const plan = reconcile({ ...base, snapshot });
    const issue = plan.issues.find((i) => i.kind === "wrong_child");
    expect(issue).toBeDefined();
    expect(issue?.externalId).toBe("legacy:778");
    expect(issue?.message).toContain("Kai Stuermann");
    expect(issue?.message).toContain("Vanessa Stuermann");
    expect(issue?.message).toContain("enr-vanessa");
  });

  it("still creates the enrollment when the line item is nobody else's", () => {
    const plan = reconcile({
      ...base,
      enrollments: [],
      enrollmentExternalIds: new Map(),
      snapshot,
    });
    expect(plan.creates.find((c) => c.externalId === "legacy:778")?.studentId).toBe(kai.id);
    expect(plan.issues.find((i) => i.kind === "wrong_child")).toBeUndefined();
  });
});
