import type { RegistrationProvider } from "./provider";
import type { RegistrationSnapshot } from "./types";

/**
 * Mock registration system with realistic data that lines up with the app's
 * seed families. Includes the messy cases a real sync must survive:
 *  - an account whose email doesn't match any app family (unmatched)
 *  - a participant the app doesn't know about
 *  - an enrollment for an offering with no matching app production/class
 *  - a balance that differs from what the app currently stores
 */
export class MockRegistrationProvider implements RegistrationProvider {
  readonly source = "mock" as const;
  readonly displayName = "Mock registration system";

  /** Mutable so tests and the admin "simulate change" action can adjust it. */
  private snapshot: RegistrationSnapshot = {
    source: "mock",
    fetchedAt: "2026-07-26T12:00:00.000Z",
    accounts: [
      {
        externalId: "sw-acct-1001",
        source: "mock",
        guardianName: "Sofia Martinez",
        email: "sofia@example.com",
        phone: "703-555-0101",
      },
      {
        externalId: "sw-acct-1002",
        source: "mock",
        guardianName: "Ngozi Okafor",
        email: "ngozi@example.com",
        phone: "571-555-0110",
      },
      {
        externalId: "sw-acct-1003",
        source: "mock",
        guardianName: "Minh Nguyen",
        email: "minh@example.com",
      },
      {
        // Deliberately unmatched: a family that registered but hasn't signed
        // up for the app yet. Should surface as an issue, not an error.
        externalId: "sw-acct-1099",
        source: "mock",
        guardianName: "Priya Shah",
        email: "priya.shah@example.com",
      },
    ],
    participants: [
      { externalId: "sw-part-2001", accountExternalId: "sw-acct-1001", firstName: "Ava", lastName: "Martinez", dateOfBirth: "2015-03-12" },
      { externalId: "sw-part-2002", accountExternalId: "sw-acct-1001", firstName: "Leo", lastName: "Martinez", dateOfBirth: "2018-09-02" },
      { externalId: "sw-part-2003", accountExternalId: "sw-acct-1002", firstName: "Chidi", lastName: "Okafor", dateOfBirth: "2012-01-25" },
      { externalId: "sw-part-2004", accountExternalId: "sw-acct-1002", firstName: "Amara", lastName: "Okafor", dateOfBirth: "2016-07-19" },
      { externalId: "sw-part-2005", accountExternalId: "sw-acct-1003", firstName: "Liên", lastName: "Nguyen", dateOfBirth: "2013-11-08" },
      { externalId: "sw-part-2099", accountExternalId: "sw-acct-1099", firstName: "Rohan", lastName: "Shah", dateOfBirth: "2014-05-04" },
    ],
    enrollments: [
      {
        externalId: "sw-ord-3001",
        source: "mock",
        participantExternalId: "sw-part-2001",
        accountExternalId: "sw-acct-1001",
        offeringName: "Frozen Jr.",
        activitySetId: "1960872",
        status: "enrolled",
        balanceCents: 0,
        amountPaidCents: 45000,
        enrolledAt: "2026-06-02T14:00:00.000Z",
      },
      {
        externalId: "sw-ord-3002",
        source: "mock",
        participantExternalId: "sw-part-2001",
        accountExternalId: "sw-acct-1001",
        offeringName: "Musical Theater Dance — Level 2",
        activitySetId: "1960867",
        status: "enrolled",
        balanceCents: 0,
        amountPaidCents: 22000,
        enrolledAt: "2026-06-02T14:05:00.000Z",
      },
      {
        externalId: "sw-ord-3003",
        source: "mock",
        participantExternalId: "sw-part-2002",
        accountExternalId: "sw-acct-1001",
        offeringName: "Frozen Jr.",
        activitySetId: "1960872",
        status: "enrolled",
        // App seed says 7500; external system says 5000 → balance update.
        balanceCents: 5000,
        amountPaidCents: 40000,
        enrolledAt: "2026-06-02T14:10:00.000Z",
      },
      {
        externalId: "sw-ord-3004",
        source: "mock",
        participantExternalId: "sw-part-2003",
        accountExternalId: "sw-acct-1002",
        offeringName: "Frozen Jr.",
        activitySetId: "1960872",
        status: "enrolled",
        balanceCents: 0,
        amountPaidCents: 45000,
        enrolledAt: "2026-06-03T16:20:00.000Z",
      },
      {
        externalId: "sw-ord-3005",
        source: "mock",
        participantExternalId: "sw-part-2004",
        accountExternalId: "sw-acct-1002",
        offeringName: "Musical Theater Dance — Level 2",
        activitySetId: "1960867",
        status: "enrolled",
        balanceCents: 0,
        amountPaidCents: 22000,
        enrolledAt: "2026-06-03T16:25:00.000Z",
      },
      {
        externalId: "sw-ord-3006",
        source: "mock",
        participantExternalId: "sw-part-2005",
        accountExternalId: "sw-acct-1003",
        offeringName: "Frozen Jr.",
        activitySetId: "1960872",
        status: "enrolled",
        balanceCents: 0,
        amountPaidCents: 45000,
        enrolledAt: "2026-06-05T11:00:00.000Z",
      },
      {
        // Offering the app has never heard of → unknown_offering issue.
        externalId: "sw-ord-3007",
        source: "mock",
        participantExternalId: "sw-part-2003",
        accountExternalId: "sw-acct-1002",
        offeringName: "Private Coaching — 30 min",
        status: "enrolled",
        balanceCents: 6000,
        amountPaidCents: 0,
        enrolledAt: "2026-07-10T18:00:00.000Z",
      },
      {
        externalId: "sw-ord-3099",
        source: "mock",
        participantExternalId: "sw-part-2099",
        accountExternalId: "sw-acct-1099",
        offeringName: "Frozen Jr.",
        activitySetId: "1960872",
        status: "enrolled",
        balanceCents: 45000,
        amountPaidCents: 0,
        enrolledAt: "2026-07-20T09:30:00.000Z",
      },
    ],
  };

  isConfigured(): boolean {
    return true;
  }

  async fetchSnapshot(): Promise<RegistrationSnapshot> {
    return structuredClone(this.snapshot);
  }

  /** Test/demo helper: simulate a new enrollment appearing upstream. */
  addEnrollment(enrollment: RegistrationSnapshot["enrollments"][number]): void {
    this.snapshot.enrollments.push(enrollment);
    this.snapshot.fetchedAt = new Date().toISOString();
  }

  /** Test/demo helper: simulate a payment landing upstream. */
  setBalance(externalId: string, balanceCents: number): void {
    const enrollment = this.snapshot.enrollments.find((e) => e.externalId === externalId);
    if (enrollment) enrollment.balanceCents = balanceCents;
  }
}
