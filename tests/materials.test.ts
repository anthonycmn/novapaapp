import { beforeEach, describe, expect, it } from "vitest";
import { org, taxDetailsComplete } from "@/config/org";
import { AccessDeniedError } from "@/lib/api/provider";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";
import { ageOn, buildFsaStatement, FSA_AGE_LIMIT } from "@/lib/api/documents/fsa";
import {
  decodeTrackingToken,
  encodeTrackingToken,
  instrumentEmailBody,
} from "@/lib/api/email/tracking";
import { assertUploadAllowed, UploadRejectedError } from "@/lib/api/storage";
import * as seed from "@/lib/api/mock/seed-data";

const provider = new MockDataProvider();

/** 1×1 PNG, valid and tiny. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PDF = "data:application/pdf;base64,JVBERi0xLjQK";

beforeEach(() => {
  resetMockStore();
});

describe("upload limits are enforced server-side", () => {
  it("accepts an allowed type", () => {
    expect(() => assertUploadAllowed("headshots", PNG)).not.toThrow();
    expect(() => assertUploadAllowed("resumes", PDF)).not.toThrow();
  });

  it("rejects the wrong type for the bucket", () => {
    expect(() => assertUploadAllowed("resumes", PNG)).toThrow(UploadRejectedError);
    expect(() => assertUploadAllowed("headshots", PDF)).toThrow(UploadRejectedError);
  });

  it("rejects something that isn't a data URL at all", () => {
    expect(() => assertUploadAllowed("headshots", "https://evil.example/x.png")).toThrow(
      UploadRejectedError
    );
  });

  it("rejects a file over the size limit", () => {
    // ~16 MB of base64 exceeds the 15 MB headshot cap.
    const huge = `data:image/png;base64,${"A".repeat(22 * 1024 * 1024)}`;
    expect(() => assertUploadAllowed("headshots", huge)).toThrow(/limit/);
  });
});

describe("student materials (#4)", () => {
  it("saves the headshot as the family's own link", async () => {
    const student = await provider.setHeadshotLink(
      "user-sofia",
      "stu-ava",
      "https://drive.google.com/file/d/abc/view"
    );
    expect(student.headshotUrl).toBe("https://drive.google.com/file/d/abc/view");
    /*
     * Nothing was uploaded, so there is no derived print copy — and one left
     * over from a previous photo must not survive under the new headshot.
     */
    expect(student.headshotPrintUrl).toBeUndefined();
  });

  it("clears the headshot when the link is emptied", async () => {
    await provider.setHeadshotLink("user-sofia", "stu-ava", "https://example.com/a.jpg");
    const cleared = await provider.setHeadshotLink("user-sofia", "stu-ava", "");
    expect(cleared.headshotUrl).toBeUndefined();
  });

  it("another family cannot set materials on your student", async () => {
    await expect(
      provider.setHeadshotLink("user-ngozi", "stu-ava", "https://example.com/a.jpg")
    ).rejects.toThrow(AccessDeniedError);
    await expect(
      provider.setAuditionAudioLink("user-ngozi", "stu-ava", "https://example.com/a.mp3")
    ).rejects.toThrow(AccessDeniedError);
  });

  it("staff cannot set student materials — families own them", async () => {
    await expect(
      provider.setResumePdfLink("user-marcus", "stu-ava", "https://example.com/a.pdf")
    ).rejects.toThrow(AccessDeniedError);
  });

  it("stores and clears the audition recording", async () => {
    const withAudio = await provider.setAuditionAudioLink(
      "user-sofia",
      "stu-ava",
      "https://example.com/take-one.mp3"
    );
    expect(withAudio.auditionAudioUrl).toBe("https://example.com/take-one.mp3");
    // Emptying the box is how a recording comes down — there is no separate
    // remove call any more, for any of the three.
    const cleared = await provider.setAuditionAudioLink("user-sofia", "stu-ava", "");
    expect(cleared.auditionAudioUrl).toBeUndefined();
  });

  it("saves resume credits", async () => {
    const student = await provider.saveResumeCredits("user-sofia", "stu-ava", [
      { id: "r1", category: "role", title: "Annie — Annie Jr.", year: "2025" },
      { id: "r2", category: "special_skill", title: "Juggling" },
    ]);
    expect(student.resumeCredits).toHaveLength(2);
  });
});

describe("Dependent Care FSA eligibility", () => {
  it("computes age correctly across a birthday boundary", () => {
    expect(ageOn("2015-06-15", "2026-06-14")).toBe(10);
    expect(ageOn("2015-06-15", "2026-06-15")).toBe(11);
  });

  const base = {
    family: seed.families[0],
    guardians: seed.guardians.filter((g) => g.familyId === "fam-martinez"),
    enrollments: seed.enrollments,
    classes: seed.classes,
    productions: seed.productions,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
  };

  it("marks a child under 13 eligible", () => {
    const ava = seed.students.find((s) => s.id === "stu-ava")!; // born 2015
    const statement = buildFsaStatement({ ...base, student: ava });
    expect(statement.eligible).toBe(true);
    expect(statement.ageAtPeriodEnd).toBeLessThan(FSA_AGE_LIMIT);
  });

  it("marks a child who is 13 or older ineligible, and says why", () => {
    const chidi = seed.students.find((s) => s.id === "stu-chidi")!; // born 2012
    const statement = buildFsaStatement({
      ...base,
      family: seed.families[1],
      student: chidi,
    });
    expect(statement.eligible).toBe(false);
    expect(statement.ineligibleReason).toContain(String(FSA_AGE_LIMIT));
  });

  it("totals line items and names the paying guardian", () => {
    const ava = seed.students.find((s) => s.id === "stu-ava")!;
    const statement = buildFsaStatement({
      ...base,
      student: ava,
      paidByEnrollmentId: { "enr-1": 45000, "enr-2": 22000 },
    });
    // enr-2 is a CLASS and no longer counts: only camp fees go on the
    // statement (Tony, 17 Aug 2026), so the $220 term drops out of the total.
    expect(statement.totalCents).toBe(45000);
    expect(statement.lineItems).toHaveLength(1);
    expect(statement.excludedCount).toBeGreaterThan(0);
    expect(statement.guardianName).toBe("Sofia Martinez");
  });

  it("omits zero-value rows rather than printing $0 lines", () => {
    const ava = seed.students.find((s) => s.id === "stu-ava")!;
    const statement = buildFsaStatement({
      ...base,
      student: ava,
      paidByEnrollmentId: { "enr-1": 45000, "enr-2": 0 },
    });
    expect(statement.lineItems.every((item) => item.amountCents > 0)).toBe(true);
  });

  it("is readable by the family and by staff, but not another family", async () => {
    const period = { start: "2026-01-01", end: "2026-12-31" };
    await expect(
      provider.getFsaStatement("user-ngozi", "stu-ava", period)
    ).rejects.toThrow(AccessDeniedError);
    const own = await provider.getFsaStatement("user-sofia", "stu-ava", period);
    expect(own.studentName).toContain("Ava");
  });
});

describe("household document vault (#3)", () => {
  it("uploads, lists, and deletes a document", async () => {
    const document = await provider.uploadFamilyDocument("user-sofia", "fam-martinez", {
      name: "Signed waiver",
      category: "waiver",
      source: { kind: "dataUrl", dataUrl: PDF },
    });
    expect(document.uploadedByStaff).toBe(false);

    const listed = await provider.getFamilyDocuments("user-sofia", "fam-martinez");
    expect(listed).toHaveLength(1);

    await provider.deleteFamilyDocument("user-sofia", document.id);
    expect(await provider.getFamilyDocuments("user-sofia", "fam-martinez")).toHaveLength(0);
  });

  it("another family cannot read or write your vault", async () => {
    await expect(
      provider.getFamilyDocuments("user-ngozi", "fam-martinez")
    ).rejects.toThrow(AccessDeniedError);
    await expect(
      provider.uploadFamilyDocument("user-ngozi", "fam-martinez", {
        name: "x",
        category: "other",
        source: { kind: "dataUrl", dataUrl: PDF },
      })
    ).rejects.toThrow(AccessDeniedError);
  });

  it("a family cannot delete a document staff filed", async () => {
    const staffDoc = await provider.uploadFamilyDocument("user-dana", "fam-martinez", {
      name: "Countersigned waiver",
      category: "waiver",
      source: { kind: "dataUrl", dataUrl: PDF },
    });
    expect(staffDoc.uploadedByStaff).toBe(true);
    await expect(
      provider.deleteFamilyDocument("user-sofia", staffDoc.id)
    ).rejects.toThrow(AccessDeniedError);
    // An admin can.
    await provider.deleteFamilyDocument("user-dana", staffDoc.id);
  });

  it("rejects a disallowed file type", async () => {
    await expect(
      provider.uploadFamilyDocument("user-sofia", "fam-martinez", {
        name: "script",
        category: "other",
        source: { kind: "dataUrl", dataUrl: "data:text/html;base64,PHNjcmlwdD4=" },
      })
    ).rejects.toThrow(UploadRejectedError);
  });
});

describe("family directory (#3)", () => {
  it("is staff-only", async () => {
    await expect(provider.getFamiliesDirectory("user-sofia")).rejects.toThrow(
      AccessDeniedError
    );
    await expect(provider.getFamiliesDirectory("user-chidi")).rejects.toThrow(
      AccessDeniedError
    );
  });

  it("returns every family with students and guardians for staff", async () => {
    const directory = await provider.getFamiliesDirectory("user-marcus");
    expect(directory).toHaveLength(3);
    const martinez = directory.find((entry) => entry.family.id === "fam-martinez")!;
    expect(martinez.students).toHaveLength(2);
    expect(martinez.guardians.length).toBeGreaterThan(0);
  });
});

describe("staff self-edit with approval (#14)", () => {
  it("queues changes without publishing them", async () => {
    const profile = await provider.submitStaffProfileChanges("user-priya", "staff-priya", {
      bio: "Updated bio",
    });
    expect(profile.pendingChanges?.bio).toBe("Updated bio");
    // The live profile is untouched until approval.
    const live = await provider.getStaffProfile("staff-priya");
    expect(live?.bio).not.toBe("Updated bio");
  });

  it("a staff member cannot edit someone else's profile", async () => {
    await expect(
      provider.submitStaffProfileChanges("user-marcus", "staff-priya", { bio: "nope" })
    ).rejects.toThrow(AccessDeniedError);
  });

  it("approval publishes the change and clears the queue", async () => {
    await provider.submitStaffProfileChanges("user-priya", "staff-priya", {
      bio: "Approved bio",
    });
    const approved = await provider.approveStaffChanges("user-dana", "staff-priya");
    expect(approved.bio).toBe("Approved bio");
    expect(approved.pendingChanges).toBeUndefined();
    expect(await provider.getPendingStaffChanges("user-dana")).toHaveLength(0);
  });

  it("rejection discards the change and notifies the author", async () => {
    await provider.submitStaffProfileChanges("user-priya", "staff-priya", {
      bio: "Rejected bio",
    });
    await provider.rejectStaffChanges("user-dana", "staff-priya", "Too long");
    const live = await provider.getStaffProfile("staff-priya");
    expect(live?.bio).not.toBe("Rejected bio");
    expect(live?.pendingChanges).toBeUndefined();

    const notifications = await provider.getNotifications("user-priya");
    expect(notifications.some((n) => n.body === "Too long")).toBe(true);
  });

  it("only admins approve or reject", async () => {
    await provider.submitStaffProfileChanges("user-priya", "staff-priya", { bio: "x" });
    await expect(
      provider.approveStaffChanges("user-marcus", "staff-priya")
    ).rejects.toThrow(AccessDeniedError);
    await expect(
      provider.getPendingStaffChanges("user-marcus")
    ).rejects.toThrow(AccessDeniedError);
  });
});

describe("email tracking (#1)", () => {
  it("round-trips a signed token", () => {
    const token = encodeTrackingToken({ sendId: "send-1", recipientId: "user-sofia" });
    expect(decodeTrackingToken(token)).toEqual({
      sendId: "send-1",
      recipientId: "user-sofia",
    });
  });

  it("rejects a tampered token — analytics can't be poisoned", () => {
    const token = encodeTrackingToken({ sendId: "send-1", recipientId: "user-sofia" });
    const [payload, signature] = token.split(".");
    // Swap in a different recipient, keep the old signature.
    const forged = `${Buffer.from("send-1:user-ngozi").toString("base64url")}.${signature}`;
    expect(decodeTrackingToken(forged)).toBeNull();
    expect(decodeTrackingToken(`${payload}.deadbeef`)).toBeNull();
    expect(decodeTrackingToken("garbage")).toBeNull();
  });

  it("rewrites links and appends a pixel", () => {
    const body = instrumentEmailBody(
      "Tickets: https://novapa.booktix.com/show",
      { sendId: "s1", recipientId: "u1" },
      "https://app.example.org"
    );
    expect(body).toContain("/api/email/click/");
    expect(body).toContain(encodeURIComponent("https://novapa.booktix.com/show"));
    expect(body).toContain("/api/email/open/");
  });

  it("never wraps an unsubscribe link", () => {
    const body = instrumentEmailBody(
      "Opt out: https://app.example.org/unsubscribe?t=abc",
      { sendId: "s1", recipientId: "u1" },
      "https://app.example.org"
    );
    expect(body).toContain("https://app.example.org/unsubscribe?t=abc");
    expect(body).not.toContain("/api/email/click/");
  });

  it("counts an open once per recipient, and a click implies an open", async () => {
    const send = await provider.sendEmail("user-dana", {
      subject: "Hello",
      body: "Body https://example.org",
      category: "newsletter",
      audience: {},
    });

    await provider.recordEmailOpen(send.id, "user-sofia");
    await provider.recordEmailOpen(send.id, "user-sofia");
    await provider.recordEmailClick(send.id, "user-ngozi", "https://example.org");

    const engagement = await provider.getEmailEngagement("user-dana", send.id);
    expect(engagement.opens).toHaveLength(2); // sofia once, ngozi via click
    expect(engagement.clicks).toHaveLength(1);
    expect(engagement.nonOpeners.map((u) => u.id)).toEqual(["user-minh"]);
  });

  it("engagement is staff-only", async () => {
    const send = await provider.sendEmail("user-dana", {
      subject: "x",
      body: "y",
      category: "newsletter",
      audience: {},
    });
    await expect(
      provider.getEmailEngagement("user-sofia", send.id)
    ).rejects.toThrow(AccessDeniedError);
  });
});

describe("only camp fees reach an FSA statement", () => {
  const base = {
    family: seed.families[0],
    guardians: seed.guardians.filter((g) => g.familyId === "fam-martinez"),
    classes: seed.classes,
    productions: seed.productions,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
  };
  const ava = seed.students.find((s) => s.id === "stu-ava")!;

  const enrollment = (id: string, category: string | undefined, productionId = "prod-frozen") => ({
    id,
    studentId: "stu-ava",
    productionId,
    status: "enrolled" as const,
    balanceCents: 0,
    source: "registration_portal" as const,
    offeringCategory: category,
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  it("keeps camp and drops classes, coaching and performances", () => {
    const statement = buildFsaStatement({
      ...base,
      student: ava,
      enrollments: [
        enrollment("e-camp", "camp"),
        enrollment("e-class", "class"),
        enrollment("e-coach", "coaching"),
        enrollment("e-perf", "performance"),
      ],
      paidByEnrollmentId: {
        "e-camp": 50000,
        "e-class": 22000,
        "e-coach": 18000,
        "e-perf": 9000,
      },
    });
    expect(statement.lineItems).toHaveLength(1);
    expect(statement.totalCents).toBe(50000);
    expect(statement.excludedCount).toBe(3);
  });

  it("leaves out an enrollment the registration system did not classify", () => {
    // On a document a family files with the IRS, "we are not sure" has to mean
    // "not claimed" — never "claimed anyway".
    const statement = buildFsaStatement({
      ...base,
      student: ava,
      enrollments: [enrollment("e-unknown", undefined)],
      paidByEnrollmentId: { "e-unknown": 40000 },
    });
    expect(statement.lineItems).toHaveLength(0);
    expect(statement.totalCents).toBe(0);
    expect(statement.eligible).toBe(false);
  });

  it("matches the category case-insensitively", () => {
    const statement = buildFsaStatement({
      ...base,
      student: ava,
      enrollments: [enrollment("e-camp", " Camp ")],
      paidByEnrollmentId: { "e-camp": 30000 },
    });
    expect(statement.totalCents).toBe(30000);
  });

  it("lists a camp with no payment record, and marks it unpriced", () => {
    // It still qualifies — telling that family they do not would be wrong about
    // the law. But the line says "not on record" rather than $0.00, because a
    // confident zero on a claim form is a quiet lie they only discover when it
    // is refused.
    const statement = buildFsaStatement({
      ...base,
      student: ava,
      enrollments: [enrollment("e-camp", "camp")],
    });
    expect(statement.eligible).toBe(true);
    expect(statement.lineItems).toHaveLength(1);
    expect(statement.lineItems[0].amountUnknown).toBe(true);
    expect(statement.unpricedCount).toBe(1);
    expect(statement.totalCents).toBe(0);
  });

  it("uses the paid amount synced from the registration system", () => {
    const statement = buildFsaStatement({
      ...base,
      student: ava,
      enrollments: [{ ...enrollment("e-camp", "camp"), amountPaidCents: 61500 }],
    });
    expect(statement.totalCents).toBe(61500);
    expect(statement.lineItems[0].amountUnknown).toBe(false);
    expect(statement.unpricedCount).toBe(0);
  });

  it("does not invent an amount from the balance", () => {
    // The old fallback was max(0, -balance), which is ZERO for anything paid in
    // full — so every real statement would have listed camps at $0.00 each.
    const statement = buildFsaStatement({
      ...base,
      student: ava,
      enrollments: [{ ...enrollment("e-camp", "camp"), balanceCents: -75000 }],
    });
    expect(statement.totalCents).toBe(0);
    expect(statement.unpricedCount).toBe(1);
  });

  it("explains a camp-less household rather than blaming their age", () => {
    const statement = buildFsaStatement({
      ...base,
      student: ava,
      enrollments: [enrollment("e-class", "class")],
      paidByEnrollmentId: { "e-class": 22000 },
    });
    expect(statement.eligible).toBe(false);
    expect(statement.ineligibleReason).toMatch(/day camp/i);
    expect(statement.ineligibleReason).not.toMatch(/covers children under/i);
  });
});

describe("the org details an FSA administrator checks", () => {
  it("is complete enough to issue a statement", () => {
    // The page prints a visible warning instead of a form that looks official
    // and bounces, so this going false is a silent regression for 160 families.
    expect(taxDetailsComplete()).toBe(true);
  });

  it("formats the EIN as 12-3456789", () => {
    // An administrator matches the EIN against the legal name; a stray space or
    // a missing hyphen gets the claim refused, not queried.
    expect(org.tax.ein).toMatch(/^\d{2}-\d{7}$/);
  });

  it("names the legal entity, not the trading name", () => {
    // The EIN belongs to the LLC, and the two have to agree.
    expect(org.tax.legalName).toMatch(/CJ Creative, LLC/);
  });

  it("gives the signatory a full name and a title", () => {
    expect(org.tax.signatoryName.trim().split(/\s+/).length).toBeGreaterThan(1);
    expect(org.tax.signatoryTitle.trim().length).toBeGreaterThan(0);
  });
});
