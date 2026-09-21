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

/**
 * The Rodgers case, 20 Sep 2026, reached the other way.
 *
 * Making students.camper_id the join pointed the resolver at the keyed one of
 * two student rows for the same child, while the unkeyed row still held the
 * line item. The keyed row already had an enrollment for the same production,
 * added by hand and never stamped, so the sync stopped trying to create and
 * started trying to adopt: PATCH the external id onto it. Same unique index,
 * same 23505, 97 conflicts in 24 hours on one enrollment.
 *
 * The create guard above cannot see this one, because an enrollment exists.
 * The rule here: withhold the stamp, report it, and let every other column on
 * the row keep updating, because the enrollment is not in doubt and a family's
 * balance should not go stale while a duplicate student row is sorted out.
 */
describe("a line item another enrollment already holds, on a row we would adopt", () => {
  const production = seed.productions[0];
  const family = seed.families[0];
  const keyed = {
    ...seed.students[0],
    id: "stu-ryan-keyed",
    familyId: family.id,
    firstName: "Ryan",
    lastName: "Rodgers",
  };
  const unkeyed = {
    ...seed.students[0],
    id: "stu-ryan-unkeyed",
    familyId: family.id,
    firstName: "Ryan",
    lastName: "Rodgers",
  };

  const base = {
    families: [family],
    guardians: [{ ...seed.guardians[0], email: "r@example.com", familyId: family.id }],
    students: [keyed, unkeyed],
    productions: seed.productions,
    classes: seed.classes,
    links: [],
    // Only the keyed row carries a camper id, so the resolver picks it.
    studentCamperIds: new Map([[keyed.id, "camper-ryan"]]),
    enrollments: [
      {
        ...seed.enrollments[0],
        id: "enr-ryan-keyed",
        studentId: keyed.id,
        productionId: production.id,
        classId: undefined,
        status: "enrolled" as const,
        balanceCents: 0,
      },
      {
        ...seed.enrollments[0],
        id: "enr-ryan-unkeyed",
        studentId: unkeyed.id,
        productionId: production.id,
        classId: undefined,
        status: "enrolled" as const,
        balanceCents: 0,
      },
    ],
    // The line item sits on the unkeyed row. The keyed row has no line item,
    // which is exactly why the sync wants to stamp it.
    enrollmentExternalIds: new Map([["enr-ryan-unkeyed", "legacy:699"]]),
  };

  const snapshot = {
    accounts: [
      { externalId: "acct-r", source: "website" as const, guardianName: "R", email: "r@example.com" },
    ],
    participants: [
      { externalId: "camper-ryan", accountExternalId: "acct-r", firstName: "Ryan", lastName: "Rodgers" },
    ],
    enrollments: [
      {
        externalId: "legacy:699",
        source: "website" as const,
        participantExternalId: "camper-ryan",
        accountExternalId: "acct-r",
        offeringName: production.title,
        offeringCategory: "camp",
        status: "enrolled" as const,
        balanceCents: 12500,
        amountPaidCents: 0,
        enrolledAt: "2026-09-05T00:00:00.000Z",
      },
    ],
    fetchedAt: "2026-09-21T10:45:00.000Z",
    source: "website" as const,
  };

  it("never stamps the line item onto the second row", () => {
    const plan = reconcile({ ...base, snapshot });
    const update = plan.updates.find((u) => u.enrollmentId === "enr-ryan-keyed");
    expect(update?.externalId).toBeUndefined();
  });

  it("still updates the balance on that row", () => {
    const plan = reconcile({ ...base, snapshot });
    const update = plan.updates.find((u) => u.enrollmentId === "enr-ryan-keyed");
    expect(update?.balanceCents).toBe(12500);
  });

  it("is reported, naming both student records and the enrollment holding it", () => {
    const plan = reconcile({ ...base, snapshot });
    const issue = plan.issues.find((i) => i.kind === "wrong_child");
    expect(issue).toBeDefined();
    expect(issue?.externalId).toBe("legacy:699");
    expect(issue?.message).toContain("Ryan Rodgers");
    expect(issue?.message).toContain("enr-ryan-unkeyed");
    expect(issue?.message).toContain("enr-ryan-keyed");
  });

  it("creates nothing, because the enrollment is already there", () => {
    const plan = reconcile({ ...base, snapshot });
    expect(plan.counts.enrollmentsCreated).toBe(0);
  });

  it("stamps normally when no other enrollment holds the line item", () => {
    const plan = reconcile({
      ...base,
      enrollments: base.enrollments.filter((e) => e.id === "enr-ryan-keyed"),
      enrollmentExternalIds: new Map(),
      snapshot,
    });
    const update = plan.updates.find((u) => u.enrollmentId === "enr-ryan-keyed");
    expect(update?.externalId).toBe("legacy:699");
    expect(plan.issues.find((i) => i.kind === "wrong_child")).toBeUndefined();
  });
});
