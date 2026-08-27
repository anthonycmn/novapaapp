import { reconcile } from "@/lib/api/registration/reconcile";
import * as seed from "@/lib/api/mock/seed-data";
import { describe, expect, it } from "vitest";
import {
  parseCatalogDate,
  parseSessionDates,
  sessionDatesFromClassTimes,
} from "@/lib/api/registration/session-dates";

/**
 * These dates go on a Dependent Care FSA statement, so the bar is not "usually
 * right" — a confidently wrong date is worse than the honest tax-year range it
 * replaces. Every case below either parses exactly or returns null.
 */

describe("a single catalogue date", () => {
  it("reads the shape the website actually publishes", () => {
    expect(parseCatalogDate("Jul 19, 2027")).toBe("2027-07-19");
    expect(parseCatalogDate("Nov 9, 2026")).toBe("2026-11-09");
    expect(parseCatalogDate("Aug 2, 2027")).toBe("2027-08-02");
  });

  it("tolerates the punctuation a human would vary", () => {
    expect(parseCatalogDate("Sept. 3, 2026")).toBe("2026-09-03");
    expect(parseCatalogDate("March 1 2026")).toBe("2026-03-01");
    expect(parseCatalogDate("  Jul 19, 2027  ")).toBe("2027-07-19");
    expect(parseCatalogDate("Jul 1st, 2027")).toBe("2027-07-01");
  });

  it("refuses a day that does not exist", () => {
    // Date() would roll this to 2 March; a statement would then certify care
    // on a day nobody attended.
    expect(parseCatalogDate("Feb 30, 2027")).toBeNull();
    expect(parseCatalogDate("Apr 31, 2027")).toBeNull();
  });

  it("refuses anything it does not fully understand", () => {
    expect(parseCatalogDate("Summer 2027")).toBeNull();
    expect(parseCatalogDate("Jul 19")).toBeNull();
    expect(parseCatalogDate("19 Jul 2027")).toBeNull();
    expect(parseCatalogDate("Jly 19, 2027")).toBeNull();
    expect(parseCatalogDate("")).toBeNull();
  });
});

describe("a session range", () => {
  it("reads a two-week camp", () => {
    expect(parseSessionDates("Jul 19, 2027 - Jul 30, 2027")).toEqual({
      startsOn: "2027-07-19",
      endsOn: "2027-07-30",
    });
  });

  it("reads a season that crosses a new year", () => {
    expect(parseSessionDates("Nov 16, 2026 - Mar 21, 2027")).toEqual({
      startsOn: "2026-11-16",
      endsOn: "2027-03-21",
    });
  });

  it("treats a single day as care that starts and ends that day", () => {
    // Not an open-ended session: a camp on 9 November is care on 9 November.
    expect(parseSessionDates("Nov 9, 2026")).toEqual({
      startsOn: "2026-11-09",
      endsOn: "2026-11-09",
    });
  });

  it("handles en and em dashes as well as a hyphen", () => {
    expect(parseSessionDates("Jul 5, 2027 – Jul 16, 2027")?.endsOn).toBe("2027-07-16");
    expect(parseSessionDates("Jul 5, 2027 — Jul 16, 2027")?.endsOn).toBe("2027-07-16");
  });

  it("rejects a range that runs backwards", () => {
    // That is a parse we got wrong, not a session anybody attended.
    expect(parseSessionDates("Jul 30, 2027 - Jul 19, 2027")).toBeNull();
  });

  it("rejects a half-understood range rather than keeping the good half", () => {
    expect(parseSessionDates("Jul 19, 2027 - TBC")).toBeNull();
    expect(parseSessionDates("Summer - Jul 30, 2027")).toBeNull();
  });

  it("returns null for nothing at all", () => {
    expect(parseSessionDates(undefined)).toBeNull();
    expect(parseSessionDates(null)).toBeNull();
    expect(parseSessionDates("")).toBeNull();
  });
});

describe("reading class_times off an activity", () => {
  // The exact shape returned by public.activities.
  const realCamp = [
    {
      fine_print: null,
      title_text: "Mon, Tue, Wed, Thu, Fri",
      primary_text: ["8:30am - 4:15pm EDT"],
      secondary_text: "Jul 19, 2027 - Jul 30, 2027",
      product_detail_date: "Jul 19, 2027 - Jul 30, 2027",
    },
  ];

  it("reads the real shape", () => {
    expect(sessionDatesFromClassTimes(realCamp)).toEqual({
      startsOn: "2027-07-19",
      endsOn: "2027-07-30",
    });
  });

  it("falls back to secondary_text when the detail date is missing", () => {
    expect(
      sessionDatesFromClassTimes([{ secondary_text: "Nov 9, 2026" }])
    ).toEqual({ startsOn: "2026-11-09", endsOn: "2026-11-09" });
  });

  it("skips entries it cannot read and keeps looking", () => {
    expect(
      sessionDatesFromClassTimes([
        { product_detail_date: "Ongoing" },
        null,
        "not an object",
        { product_detail_date: "Aug 2, 2027 - Aug 13, 2027" },
      ])
    ).toEqual({ startsOn: "2027-08-02", endsOn: "2027-08-13" });
  });

  it("returns null for an empty or malformed column", () => {
    expect(sessionDatesFromClassTimes([])).toBeNull();
    expect(sessionDatesFromClassTimes(null)).toBeNull();
    expect(sessionDatesFromClassTimes({})).toBeNull();
    expect(sessionDatesFromClassTimes([{ product_detail_date: "Ongoing" }])).toBeNull();
  });
});

describe("capturing session dates once", () => {
  const snapshot = (sessionStartsOn?: string, sessionEndsOn?: string) => ({
    accounts: [{ externalId: "acct-1", source: "website" as const, guardianName: "P", email: "p@example.com" }],
    participants: [
      { externalId: "part-1", accountExternalId: "acct-1", firstName: "Ava", lastName: "Martinez" },
    ],
    enrollments: [
      {
        externalId: "item-1",
        source: "website" as const,
        participantExternalId: "part-1",
        accountExternalId: "acct-1",
        offeringName: "Frozen Jr.",
        offeringCategory: "camp",
        sessionStartsOn,
        sessionEndsOn,
        status: "enrolled" as const,
        balanceCents: 0,
        amountPaidCents: 50000,
        enrolledAt: "2026-07-01T00:00:00.000Z",
      },
    ],
    fetchedAt: "2026-08-17T00:00:00.000Z",
    source: "website" as const,
  });

  const student = {
    ...seed.students.find((s) => s.id === "stu-ava")!,
    firstName: "Ava",
    lastName: "Martinez",
  };
  const base = {
    families: [seed.families[0]],
    guardians: [{ ...seed.guardians[0], email: "p@example.com", familyId: seed.families[0].id }],
    students: [{ ...student, familyId: seed.families[0].id }],
    productions: seed.productions,
    classes: seed.classes,
    links: [],
    // These fixtures model rows the sync itself created, so they already carry
    // the line item they came from. Without this they would look hand-added,
    // and every case here would gain an extra update stamping "item-1" on.
    enrollmentExternalIds: new Map([["enr-existing", "item-1"]]),
  };

  const existing = (patch: Partial<(typeof seed.enrollments)[number]> = {}) => [
    {
      ...seed.enrollments[0],
      id: "enr-existing",
      studentId: student.id,
      productionId: seed.productions[0].id,
      offeringCategory: "camp",
      amountPaidCents: 50000,
      balanceCents: 0,
      status: "enrolled" as const,
      ...patch,
    },
  ];

  it("captures the dates when the row has none", () => {
    const plan = reconcile({
      ...base,
      snapshot: snapshot("2026-07-20", "2026-07-31"),
      enrollments: existing({ sessionStartsOn: undefined, sessionEndsOn: undefined }),
    });
    const update = plan.updates.find((u) => u.enrollmentId === "enr-existing");
    expect(update?.sessionStartsOn).toBe("2026-07-20");
    expect(update?.sessionEndsOn).toBe("2026-07-31");
  });

  it("NEVER rewrites dates it already holds", () => {
    // The catalogue rolls over every season: summer 2026's camps already list
    // July 2027. Backfilling like the other columns would rewrite the dates on
    // care a family has been given, and on a statement they may have filed.
    const plan = reconcile({
      ...base,
      snapshot: snapshot("2027-07-19", "2027-07-30"),
      enrollments: existing({ sessionStartsOn: "2026-07-20", sessionEndsOn: "2026-07-31" }),
    });
    const update = plan.updates.find((u) => u.enrollmentId === "enr-existing");
    expect(update?.sessionStartsOn).toBeUndefined();
    expect(update?.sessionEndsOn).toBeUndefined();
  });

  it("does not manufacture an update when there is nothing to capture", () => {
    const plan = reconcile({
      ...base,
      snapshot: snapshot(undefined, undefined),
      enrollments: existing({ sessionStartsOn: undefined, sessionEndsOn: undefined }),
    });
    expect(plan.updates.find((u) => u.enrollmentId === "enr-existing")).toBeUndefined();
  });
});
