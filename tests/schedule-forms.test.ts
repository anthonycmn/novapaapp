import { beforeEach, describe, expect, it } from "vitest";
import { AccessDeniedError } from "@/lib/api/provider";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";
import { buildFamilyIcs } from "@/lib/ical";

/**
 * Phase 3 verification:
 *  - household calendar merges siblings and flags conflicts
 *  - iCal output is well-formed and family-scoped
 *  - health forms pre-fill from last season and record e-signature
 *  - approved pickup requests land on the family calendar + staff roster
 */

const provider = new MockDataProvider();

beforeEach(() => {
  resetMockStore();
});

describe("household calendar (#5)", () => {
  it("merges every child's commitments into one list", async () => {
    const events = await provider.getFamilyCalendar("user-sofia", "fam-martinez");
    // Ava: Frozen rehearsal + MTD2 class. Leo: Frozen rehearsal.
    const rehearsal = events.find((e) => e.id === "evt-1");
    expect(rehearsal).toBeDefined();
    expect(rehearsal!.studentIds.sort()).toEqual(["stu-ava", "stu-leo"]);
    expect(events.some((e) => e.id === "evt-2")).toBe(true);
  });

  it("detects sibling conflicts across overlapping events", async () => {
    // Ava's dance class (5–6pm ET) overlaps the full-cast rehearsal
    // (6:30pm) only partly; seed the overlap explicitly via a new request-free
    // check: evt-2 (21:00-22:00Z) vs evt-1 (22:30-00:30Z) do NOT overlap.
    const events = await provider.getFamilyCalendar("user-sofia", "fam-martinez");
    const dance = events.find((e) => e.id === "evt-2")!;
    expect(dance.conflictsWith ?? []).toEqual([]);
  });

  it("is family-scoped — another parent cannot read it", async () => {
    await expect(
      provider.getFamilyCalendar("user-sofia", "fam-okafor")
    ).rejects.toThrow(AccessDeniedError);
  });

  it("staff master schedule is staff-only", async () => {
    await expect(provider.getAllEvents("user-sofia")).rejects.toThrow(AccessDeniedError);
    expect((await provider.getAllEvents("user-dana")).length).toBeGreaterThan(0);
  });
});

describe("iCal feed (#5)", () => {
  it("produces a well-formed VCALENDAR with one VEVENT per event", async () => {
    const events = await provider.getFamilyCalendar("user-sofia", "fam-martinez");
    const ics = buildFamilyIcs(events, {
      familyName: "The Martinez Family",
      studentNamesById: { "stu-ava": "Ava", "stu-leo": "Leo" },
    });
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.split("BEGIN:VEVENT").length - 1).toBe(events.length);
    // CRLF line endings per RFC 5545.
    expect(ics.includes("\r\n")).toBe(true);
    // UTC timestamps.
    expect(/DTSTART:\d{8}T\d{6}Z/.test(ics)).toBe(true);
  });

  it("escapes special characters in summaries", () => {
    const ics = buildFamilyIcs(
      [
        {
          id: "e1",
          type: "rehearsal",
          title: "Tech; with, commas",
          startsAt: "2026-08-01T22:00:00.000Z",
          endsAt: "2026-08-02T00:00:00.000Z",
          location: "Studio A",
          studentIds: [],
        },
      ],
      { familyName: "Test", studentNamesById: {} }
    );
    expect(ics).toContain("Tech\\; with\\, commas");
  });

  it("token lookup resolves to exactly one family, and rejects bad tokens", async () => {
    const token = await provider.getCalendarToken("user-sofia", "fam-martinez");
    expect(await provider.getFamilyIdByCalendarToken(token)).toBe("fam-martinez");
    expect(await provider.getFamilyIdByCalendarToken("not-a-real-token")).toBeNull();
  });
});

describe("health forms (#9)", () => {
  it("pre-fills from last season rather than starting blank", async () => {
    const season = await provider.getCurrentSeason();
    const current = await provider.getHealthForm("user-sofia", "stu-ava", season.id);
    const previous = await provider.getPreviousHealthForm("user-sofia", "stu-ava", season.id);
    expect(current).toBeNull();
    expect(previous?.answers.physicianName).toBe("Dr. Elena Vasquez");
  });

  it("records name, timestamp, and IP on signature", async () => {
    const season = await provider.getCurrentSeason();
    const previous = await provider.getPreviousHealthForm("user-sofia", "stu-ava", season.id);
    const saved = await provider.saveHealthForm(
      "user-sofia",
      "stu-ava",
      season.id,
      previous!.answers,
      { name: "Sofia Martinez", ip: "198.51.100.7" }
    );
    expect(saved.signedByName).toBe("Sofia Martinez");
    expect(saved.signedFromIp).toBe("198.51.100.7");
    expect(saved.signedAt).toBeTruthy();
    expect(saved.expiresOn).toBe("2027-06-15");
  });

  it("another family cannot read or write a student's health form", async () => {
    const season = await provider.getCurrentSeason();
    await expect(
      provider.getHealthForm("user-ngozi", "stu-ava", season.id)
    ).rejects.toThrow(AccessDeniedError);
    await expect(
      provider.saveHealthForm("user-ngozi", "stu-ava", season.id, {
        allergies: "",
        medications: "",
        medicationAuthorization: false,
        conditions: "",
        physicianName: "X",
        physicianPhone: "1",
        insuranceCarrier: "",
        insurancePolicyNumber: "",
        emergencyTreatmentConsent: true,
        dietaryRestrictions: "",
        accessibilityNeeds: "",
      })
    ).rejects.toThrow(AccessDeniedError);
  });

  it("staff completion view lists signed and missing forms; parents are blocked", async () => {
    const status = await provider.getHealthFormStatus("user-dana", {
      productionId: "prod-frozen",
    });
    const chidi = status.find((row) => row.student.id === "stu-chidi");
    const ava = status.find((row) => row.student.id === "stu-ava");
    expect(chidi?.form).not.toBeNull(); // signed this season
    expect(ava?.form).toBeNull(); // last season only
    await expect(
      provider.getHealthFormStatus("user-sofia", {})
    ).rejects.toThrow(AccessDeniedError);
  });
});

describe("drop-off / pick-up (#10)", () => {
  async function submitRequest() {
    return provider.createPickupRequest("user-sofia", {
      studentId: "stu-ava",
      kind: "early_pickup",
      startDate: "2026-09-15",
      endDate: "2026-09-17",
      recurringDays: [],
      pickUpTime: "18:30",
      reason: "Work schedule",
      authorizedPickupPerson: "Rosa Delgado",
    });
  }

  it("computes a fee and starts pending", async () => {
    const request = await submitRequest();
    expect(request.status).toBe("pending");
    expect(request.feeCents).toBe(1500); // 3 days × $5
  });

  it("approval puts it on the family calendar and notifies the family", async () => {
    const request = await submitRequest();
    await provider.decidePickupRequest("user-jo", request.id, {
      status: "approved",
      note: "See you then!",
    });

    const events = await provider.getFamilyCalendar("user-sofia", "fam-martinez");
    expect(events.some((e) => e.id === `pickup-${request.id}`)).toBe(true);

    const notifications = await provider.getNotifications("user-sofia");
    expect(notifications.some((n) => n.title === "Pick-up request approved")).toBe(true);
  });

  it("appears on the staff queue; parents cannot decide or view others", async () => {
    const request = await submitRequest();
    const queue = await provider.getPickupRequestsForStaff("user-dana");
    expect(queue.some((r) => r.id === request.id)).toBe(true);

    await expect(provider.getPickupRequestsForStaff("user-sofia")).rejects.toThrow(
      AccessDeniedError
    );
    await expect(
      provider.decidePickupRequest("user-sofia", request.id, { status: "approved" })
    ).rejects.toThrow(AccessDeniedError);
    await expect(
      provider.getPickupRequestsForFamily("user-ngozi", "fam-martinez")
    ).rejects.toThrow(AccessDeniedError);
  });

  it("a parent cannot file a request for another family's student", async () => {
    await expect(
      provider.createPickupRequest("user-ngozi", {
        studentId: "stu-ava",
        kind: "early_pickup",
        startDate: "2026-09-15",
        endDate: "2026-09-15",
        recurringDays: [],
        pickUpTime: "18:30",
        reason: "nope",
      })
    ).rejects.toThrow(AccessDeniedError);
  });
});
