import { beforeEach, describe, expect, it } from "vitest";
import { AccessDeniedError } from "@/lib/api/provider";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";
import { MockRegistrationProvider } from "@/lib/api/registration/mock";
import { mapSnapshot } from "@/lib/api/registration/custom";
import { reconcile } from "@/lib/api/registration/reconcile";
import * as seed from "@/lib/api/mock/seed-data";

/**
 * Phase 4 verification:
 *  - an enrollment created in the registration system appears in the app
 *    within one sync cycle
 *  - sync failures surface in the admin health view rather than silently
 * Plus the reconciliation edge cases a real portal will produce.
 */

const provider = new MockDataProvider();

beforeEach(() => {
  resetMockStore();
});

function reconcileInput(snapshot: Awaited<ReturnType<MockRegistrationProvider["fetchSnapshot"]>>) {
  return {
    snapshot,
    families: seed.families,
    guardians: seed.guardians,
    students: seed.students,
    enrollments: seed.enrollments,
    productions: seed.productions,
    classes: seed.classes,
    links: [],
  };
}

describe("reconciliation (pure)", () => {
  it("auto-links accounts to families by guardian email", async () => {
    const snapshot = await new MockRegistrationProvider().fetchSnapshot();
    const plan = reconcile(reconcileInput(snapshot));
    const linkedFamilies = plan.autoLinks.map((link) => link.familyId).sort();
    expect(linkedFamilies).toEqual(["fam-martinez", "fam-nguyen", "fam-okafor"]);
    expect(plan.autoLinks.every((link) => link.autoMatched)).toBe(true);
  });

  it("reports an unmatched account instead of guessing", async () => {
    const snapshot = await new MockRegistrationProvider().fetchSnapshot();
    const plan = reconcile(reconcileInput(snapshot));
    const unmatched = plan.issues.filter((issue) => issue.kind === "unmatched_account");
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].message).toContain("priya.shah@example.com");
  });

  it("reports an offering it cannot map instead of dropping it silently", async () => {
    const snapshot = await new MockRegistrationProvider().fetchSnapshot();
    const plan = reconcile(reconcileInput(snapshot));
    const unknown = plan.issues.filter((issue) => issue.kind === "unknown_offering");
    expect(unknown.some((issue) => issue.message.includes("Private Coaching"))).toBe(true);
  });

  it("updates a balance that differs from the app's value", async () => {
    const snapshot = await new MockRegistrationProvider().fetchSnapshot();
    const plan = reconcile(reconcileInput(snapshot));
    // Seed says Leo owes 7500; registration says 5000.
    const leoEnrollment = seed.enrollments.find(
      (e) => e.studentId === "stu-leo" && e.productionId === "prod-frozen"
    )!;
    const update = plan.updates.find((u) => u.enrollmentId === leoEnrollment.id);
    expect(update?.balanceCents).toBe(5000);
    expect(plan.counts.balancesUpdated).toBe(1);
  });

  it("is idempotent — a second run against unchanged data creates nothing", async () => {
    const registration = new MockRegistrationProvider();
    const snapshot = await registration.fetchSnapshot();
    const first = reconcile(reconcileInput(snapshot));
    expect(first.counts.enrollmentsCreated).toBe(0); // seed already has these

    // Apply nothing; re-running must still be a no-op.
    const second = reconcile(reconcileInput(snapshot));
    expect(second.counts.enrollmentsCreated).toBe(0);
  });

  it("matches offerings despite punctuation and case differences", () => {
    const snapshot = {
      source: "mock" as const,
      fetchedAt: "2026-07-26T12:00:00.000Z",
      accounts: [
        {
          externalId: "a1",
          source: "mock" as const,
          guardianName: "Sofia Martinez",
          email: "SOFIA@EXAMPLE.COM",
        },
      ],
      participants: [
        {
          externalId: "p1",
          accountExternalId: "a1",
          firstName: "Ava",
          lastName: "Martinez",
          dateOfBirth: "2015-03-12",
        },
      ],
      enrollments: [
        {
          externalId: "e1",
          source: "mock" as const,
          participantExternalId: "p1",
          accountExternalId: "a1",
          // Different dash and casing than the app's "Musical Theater Dance — Level 2"
          offeringName: "musical theater dance - level 2",
          status: "enrolled" as const,
          balanceCents: 0,
          amountPaidCents: 0,
          enrolledAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    };
    const plan = reconcile(reconcileInput(snapshot));
    expect(plan.issues.filter((i) => i.kind === "unknown_offering")).toHaveLength(0);
  });

  /* ── coaching: the staff portal's, resolved through its catalog ────────── */

  const coachingSnapshot = (activityId: number | undefined) => ({
    source: "website" as const,
    fetchedAt: "2026-08-15T12:00:00.000Z",
    accounts: [
      {
        externalId: "a1",
        source: "website" as const,
        guardianName: "Sofia Martinez",
        email: "sofia@example.com",
      },
    ],
    participants: [
      {
        externalId: "p1",
        accountExternalId: "a1",
        firstName: "Ava",
        lastName: "Martinez",
        dateOfBirth: "2015-03-12",
      },
    ],
    enrollments: [
      {
        externalId: "e-coach",
        source: "website" as const,
        participantExternalId: "p1",
        accountExternalId: "a1",
        // Matches no production and no class, by design — coaching is neither.
        offeringName: "10-Pack Acting Coaching Sessions",
        offeringCategory: "coaching",
        offeringActivityId: activityId,
        status: "enrolled" as const,
        balanceCents: 0,
        amountPaidCents: 105000,
        enrolledAt: "2026-08-01T00:00:00.000Z",
      },
    ],
  });

  it("resolves a coaching purchase against the staff portal's catalog", () => {
    const plan = reconcile({
      ...reconcileInput(coachingSnapshot(970404)),
      coachingActivityIds: new Set([970404]),
    });
    expect(plan.issues.filter((i) => i.kind === "unknown_offering")).toHaveLength(0);
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].coachingActivityId).toBe(970404);
    // It is coaching, so it is neither a class nor a production.
    expect(plan.creates[0].classId).toBeUndefined();
    expect(plan.creates[0].productionId).toBeUndefined();
  });

  it("still refuses to guess a coaching offering the portal does not list", () => {
    // Category says coaching, but the portal's catalog has never heard of it.
    // The whole point of the catalog is that this stays a visible issue.
    const plan = reconcile({
      ...reconcileInput(coachingSnapshot(999999)),
      coachingActivityIds: new Set([970404]),
    });
    expect(plan.creates).toHaveLength(0);
    const issues = plan.issues.filter((i) => i.kind === "unknown_offering");
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/coaching catalog/i);
  });

  it("degrades to the old behaviour when the portal catalog is unreachable", () => {
    // fetchCoachingActivityIds() returns an empty set rather than throwing, so
    // a portal outage must not silently attach coaching to the wrong thing.
    const plan = reconcile(reconcileInput(coachingSnapshot(970404)));
    expect(plan.creates).toHaveLength(0);
    expect(plan.issues.filter((i) => i.kind === "unknown_offering")).toHaveLength(1);
  });

  it("does not create a duplicate coaching enrolment on a second run", () => {
    const input = {
      ...reconcileInput(coachingSnapshot(970404)),
      coachingActivityIds: new Set([970404]),
    };
    const first = reconcile(input);
    expect(first.counts.enrollmentsCreated).toBe(1);

    const studentId = first.creates[0].studentId;
    const second = reconcile({
      ...input,
      enrollments: [
        {
          id: "existing",
          studentId,
          coachingActivityId: 970404,
          status: "enrolled" as const,
          balanceCents: 0,
          source: "registration_portal" as const,
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    expect(second.counts.enrollmentsCreated).toBe(0);
  });

  it("does not match a participant into the wrong family", () => {
    const snapshot = {
      source: "mock" as const,
      fetchedAt: "2026-07-26T12:00:00.000Z",
      accounts: [
        {
          externalId: "a1",
          source: "mock" as const,
          guardianName: "Sofia Martinez",
          email: "sofia@example.com",
        },
      ],
      // Chidi belongs to the Okafor family, not Martinez.
      participants: [
        {
          externalId: "p1",
          accountExternalId: "a1",
          firstName: "Chidi",
          lastName: "Okafor",
        },
      ],
      enrollments: [],
    };
    const plan = reconcile(reconcileInput(snapshot));
    expect(
      plan.issues.some((issue) => issue.kind === "unmatched_participant")
    ).toBe(true);
  });
});

describe("sync cycle (#8)", () => {
  it("an enrollment created upstream appears in the app after one sync", async () => {
    const registration = new MockRegistrationProvider();
    // Amara enrolls in Frozen Jr. upstream — the app has no such enrollment.
    registration.addEnrollment({
      externalId: "sw-ord-4001",
      source: "mock",
      participantExternalId: "sw-part-2004",
      accountExternalId: "sw-acct-1002",
      offeringName: "Frozen Jr.",
      activitySetId: "1960872",
      status: "enrolled",
      balanceCents: 12500,
      amountPaidCents: 0,
      enrolledAt: "2026-07-26T10:00:00.000Z",
    });

    const before = await provider.getEnrollmentsForStudent("user-ngozi", "stu-amara");
    expect(before.some((e) => e.productionId === "prod-frozen")).toBe(false);

    const snapshot = await registration.fetchSnapshot();
    const run = await provider.syncRegistration("user-dana", snapshot, "manual");

    const after = await provider.getEnrollmentsForStudent("user-ngozi", "stu-amara");
    const created = after.find((e) => e.productionId === "prod-frozen");
    expect(created).toBeDefined();
    expect(created!.balanceCents).toBe(12500);
    expect(created!.source).toBe("registration_portal");
    expect(run.counts.enrollmentsCreated).toBe(1);
  });

  it("persists auto-discovered account links", async () => {
    const snapshot = await new MockRegistrationProvider().fetchSnapshot();
    await provider.syncRegistration("user-dana", snapshot, "manual");
    const links = await provider.getAccountLinks("user-dana");
    expect(links).toHaveLength(3);
    expect(links.map((l) => l.familyId).sort()).toEqual([
      "fam-martinez",
      "fam-nguyen",
      "fam-okafor",
    ]);
  });

  it("records issues as a partial run rather than failing the whole sync", async () => {
    const snapshot = await new MockRegistrationProvider().fetchSnapshot();
    const run = await provider.syncRegistration("user-dana", snapshot, "manual");
    expect(run.status).toBe("partial");
    expect(run.issues.length).toBeGreaterThan(0);
    // Good rows still applied despite the bad ones.
    expect(run.counts.balancesUpdated).toBe(1);
  });

  it("notifies the family when a balance appears", async () => {
    const registration = new MockRegistrationProvider();
    const snapshot = await registration.fetchSnapshot();
    await provider.syncRegistration("user-dana", snapshot, "manual");
    // Leo's balance went 7500 → 5000 (still > 0) on the Martinez family.
    const notifications = await provider.getNotifications("user-sofia");
    expect(notifications.some((n) => n.type === "payment_due")).toBe(true);
  });

  it("running twice does not duplicate enrollments", async () => {
    const registration = new MockRegistrationProvider();
    const snapshot = await registration.fetchSnapshot();
    await provider.syncRegistration("user-dana", snapshot, "manual");
    const second = await provider.syncRegistration(
      "user-dana",
      await registration.fetchSnapshot(),
      "manual"
    );
    expect(second.counts.enrollmentsCreated).toBe(0);

    const ava = await provider.getEnrollmentsForStudent("user-sofia", "stu-ava");
    const frozenCount = ava.filter((e) => e.productionId === "prod-frozen").length;
    expect(frozenCount).toBe(1);
  });
});

describe("sync failures surface (#8)", () => {
  it("a failed sync is recorded and visible in the health view", async () => {
    const run = await provider.recordSyncFailure(
      "user-dana",
      "sawyer",
      "manual",
      "Could not reach the registration system: ECONNREFUSED"
    );
    expect(run.status).toBe("failed");

    const runs = await provider.getSyncRuns("user-dana");
    expect(runs[0].status).toBe("failed");
    expect(runs[0].error).toContain("ECONNREFUSED");
  });

  it("sync history and links are staff-only", async () => {
    await expect(provider.getSyncRuns("user-sofia")).rejects.toThrow(AccessDeniedError);
    await expect(provider.getAccountLinks("user-sofia")).rejects.toThrow(AccessDeniedError);
    const snapshot = await new MockRegistrationProvider().fetchSnapshot();
    await expect(
      provider.syncRegistration("user-sofia", snapshot, "manual")
    ).rejects.toThrow(AccessDeniedError);
  });

  it("only admins can hand-link an account", async () => {
    await expect(
      provider.linkAccount("user-marcus", {
        familyId: "fam-martinez",
        source: "sawyer",
        externalId: "x",
        externalEmail: "x@example.com",
      })
    ).rejects.toThrow(AccessDeniedError);

    const link = await provider.linkAccount("user-dana", {
      familyId: "fam-martinez",
      source: "sawyer",
      externalId: "x",
      externalEmail: "x@example.com",
    });
    expect(link.autoMatched).toBe(false);
  });

  it("a parent sees only their own family's link", async () => {
    await provider.linkAccount("user-dana", {
      familyId: "fam-martinez",
      source: "sawyer",
      externalId: "x",
      externalEmail: "x@example.com",
    });
    const own = await provider.getAccountLinkForFamily("user-sofia", "fam-martinez");
    expect(own?.externalId).toBe("x");
    await expect(
      provider.getAccountLinkForFamily("user-sofia", "fam-okafor")
    ).rejects.toThrow(AccessDeniedError);
  });
});

describe("custom portal payload mapping", () => {
  it("drops rows missing required fields rather than inventing values", () => {
    const snapshot = mapSnapshot({
      accounts: [
        { id: "a1", email: "Parent@Example.com", guardian_name: "Parent One" },
        { id: "a2" }, // no email → dropped
      ],
      participants: [
        { id: "p1", account_id: "a1", first_name: "Kid", last_name: "One" },
        { id: "p2", account_id: "a1", first_name: "OnlyFirst" }, // no last → dropped
      ],
      enrollments: [
        {
          id: "e1",
          participant_id: "p1",
          account_id: "a1",
          offering_name: "Frozen Jr.",
          status: "WAITLIST",
          balance_cents: 2500,
        },
        { id: "e2", account_id: "a1" }, // no participant/offering → dropped
      ],
    });

    expect(snapshot.accounts).toHaveLength(1);
    expect(snapshot.accounts[0].email).toBe("parent@example.com");
    expect(snapshot.participants).toHaveLength(1);
    expect(snapshot.enrollments).toHaveLength(1);
    expect(snapshot.enrollments[0].status).toBe("waitlisted");
    expect(snapshot.enrollments[0].balanceCents).toBe(2500);
  });

  it("accepts both bare arrays and missing sections", () => {
    const snapshot = mapSnapshot({});
    expect(snapshot.accounts).toEqual([]);
    expect(snapshot.enrollments).toEqual([]);
  });
});
