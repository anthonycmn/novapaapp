import { beforeEach, describe, expect, it } from "vitest";
import { AccessDeniedError } from "@/lib/api/provider";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";

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
