import { beforeEach, describe, expect, it } from "vitest";
import { AccessDeniedError } from "@/lib/api/provider";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";
import { describeAbsenceWindow, formatClock } from "@/lib/absence-window";

/**
 * A family reporting that a child will miss part of a show.
 *
 * Tony, 18 Aug 2026: "Allow for parents to submit absences in their dashboard
 * for their shows." The rules that matter here are whose report it is and who
 * may read it — the routing to the director is exercised by the action, which
 * needs a session, but these are the guarantees underneath it.
 */
describe("absence reports", () => {
  let provider: MockDataProvider;

  beforeEach(() => {
    resetMockStore();
    provider = new MockDataProvider();
  });

  const file = () =>
    provider.createAbsenceReport("user-sofia", {
      studentId: "stu-ava",
      productionId: "prod-frozen",
      offeringTitle: "Frozen Jr.",
      startsOn: "2026-09-15",
      endsOn: "2026-09-16",
      reason: "Strep throat",
      reportedByName: "Sofia Martinez",
    });

  it("files against the child's own household", async () => {
    const report = await file();
    expect(report.familyId).toBe("fam-martinez");
    expect(report.notified).toEqual([]);
    expect(report.createdAt).toBeTruthy();
  });

  it("is visible to the family that filed it", async () => {
    await file();
    const mine = await provider.getAbsenceReportsForFamily("user-sofia", "fam-martinez");
    expect(mine.map((report) => report.reason)).toEqual(["Strep throat"]);
  });

  it("is not visible to another family", async () => {
    await file();
    await expect(
      provider.getAbsenceReportsForFamily("user-ngozi", "fam-martinez")
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("refuses a report about somebody else's child", async () => {
    await expect(
      provider.createAbsenceReport("user-ngozi", {
        studentId: "stu-ava",
        productionId: "prod-frozen",
        offeringTitle: "Frozen Jr.",
        startsOn: "2026-09-15",
        endsOn: "2026-09-15",
        reason: "Not their child to report",
      })
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("shows staff every report, newest first", async () => {
    await file();
    const all = await provider.getAbsenceReportsForStaff("user-dana");
    expect(all).toHaveLength(1);
    await expect(
      provider.getAbsenceReportsForStaff("user-sofia")
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("records which mailboxes the notification reached", async () => {
    // So the portal can say "the show's director has no org address" instead
    // of implying the whole building was told.
    const report = await file();
    await provider.recordAbsenceNotified("user-sofia", report.id, [
      "cj@novapa.org",
      "colton@novapa.org",
    ]);
    const [stored] = await provider.getAbsenceReportsForFamily(
      "user-sofia",
      "fam-martinez"
    );
    expect(stored.notified).toEqual(["cj@novapa.org", "colton@novapa.org"]);
  });
});

/**
 * Tony, 23 Aug 2026: "Date Missed and then start time and end time — for
 * example, maybe they are arriving late… only mark the times you will not be
 * present."
 *
 * Which makes the times a description of the ABSENCE, and makes the absence of
 * times mean the whole call rather than an incomplete report. Both readings
 * have to survive, because six reports were already filed without them.
 */
describe("the part of the call that is missed", () => {
  beforeEach(() => {
    resetMockStore();
  });

  it("reads a no-times report as the whole call", () => {
    expect(
      describeAbsenceWindow({ startsOn: "2026-09-15", endsOn: "2026-09-15" })
    ).toBe("Sep 15, 2026 — the whole call");
  });

  it("reads a late arrival as the hour they are away", () => {
    expect(
      describeAbsenceWindow({
        startsOn: "2026-09-15",
        endsOn: "2026-09-15",
        startsAtTime: "19:00",
        endsAtTime: "20:00",
      })
    ).toBe("Sep 15, 2026, 7:00 PM – 8:00 PM");
  });

  it("keeps one open end open", () => {
    const from = describeAbsenceWindow({
      startsOn: "2026-09-15",
      endsOn: "2026-09-15",
      startsAtTime: "20:30",
    });
    const until = describeAbsenceWindow({
      startsOn: "2026-09-15",
      endsOn: "2026-09-15",
      endsAtTime: "18:45",
    });
    expect(from).toBe("Sep 15, 2026, from 8:30 PM");
    expect(until).toBe("Sep 15, 2026, until 6:45 PM");
  });

  it("still reads the older two-day reports as a range", () => {
    expect(
      describeAbsenceWindow({ startsOn: "2026-09-15", endsOn: "2026-09-16" })
    ).toBe("Sep 15, 2026 – Sep 16, 2026 — the whole call");
  });

  it("reads a stored time as wall clock, not as an instant", () => {
    // "19:00" carries no date and no zone. Pushed through a UTC instant it
    // would land in the afternoon, and a stage manager would expect the child
    // five hours before they actually leave.
    expect(formatClock("19:00")).toBe("7:00 PM");
    expect(formatClock("00:15")).toBe("12:15 AM");
    expect(formatClock("12:00")).toBe("12:00 PM");
    expect(formatClock("nonsense")).toBe("nonsense");
  });

  it("stores the times on the report", async () => {
    const provider = new MockDataProvider();
    const report = await provider.createAbsenceReport("user-sofia", {
      studentId: "stu-ava",
      productionId: "prod-frozen",
      offeringTitle: "Frozen Jr.",
      startsOn: "2026-09-15",
      endsOn: "2026-09-15",
      startsAtTime: "19:00",
      endsAtTime: "20:00",
      reason: "Orthodontist, she will be late",
    });
    const [stored] = await provider.getAbsenceReportsForFamily(
      "user-sofia",
      "fam-martinez"
    );
    expect(stored.id).toBe(report.id);
    expect(describeAbsenceWindow(stored)).toBe("Sep 15, 2026, 7:00 PM – 8:00 PM");
  });
});
