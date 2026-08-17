import { describe, expect, it } from "vitest";
import {
  familyAlerts,
  healthAlerts,
  reviewProfile,
  studentAlerts,
  type ProfileAlert,
} from "@/lib/profile-completeness";
import type { Family, Guardian, HealthForm, Student } from "@/lib/api/types";

const family = (patch: Partial<Family> = {}): Family => ({
  id: "fam-1",
  name: "The Test Family",
  addressLine1: "1 Main St",
  city: "Leesburg",
  state: "VA",
  zip: "20175",
  preferredContactMethod: "email",
  communicationLanguage: "en",
  emergencyContacts: [{ id: "ec-1", fullName: "Gran", phone: "555-0100", relationship: "Grandparent" }],
  authorizedPickups: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...patch,
});

const guardian = (patch: Partial<Guardian> = {}): Guardian => ({
  id: "g-1",
  familyId: "fam-1",
  fullName: "Alex Parent",
  email: "alex@example.com",
  phone: "555-0101",
  relationship: "Mother",
  isPrimary: true,
  ...patch,
});

const student = (patch: Partial<Student> = {}): Student => ({
  id: "stu-1",
  familyId: "fam-1",
  firstName: "Sam",
  lastName: "Test",
  dateOfBirth: "2013-05-04",
  grade: "8",
  school: "Test Middle",
  tshirtSize: "YL",
  headshotUrl: "https://example.com/sam.jpg",
  resumeCredits: [],
  consents: { photoUse: true, faceMatching: false, directoryVisible: true },
  hasLogin: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...patch,
});

const answers = (patch: Partial<HealthForm["answers"]> = {}): HealthForm["answers"] => ({
  allergies: "None",
  medications: "None",
  medicationAuthorization: false,
  conditions: "",
  physicianName: "Dr Who",
  physicianPhone: "555-0199",
  insuranceCarrier: "Acme Health",
  insurancePolicyNumber: "X1",
  emergencyTreatmentConsent: true,
  dietaryRestrictions: "",
  accessibilityNeeds: "",
  ...patch,
});

/** A signed form that expires comfortably in the future. */
const signedForm = (patch: Partial<HealthForm> = {}): HealthForm => ({
  id: "hf-1",
  studentId: "stu-1",
  seasonId: "season-1",
  answers: answers(),
  signedByName: "Alex Parent",
  signedAt: "2026-08-01T00:00:00.000Z",
  expiresOn: "2099-06-30",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...patch,
});

const labels = (alerts: ProfileAlert[]) => alerts.map((a) => a.label);
const required = (alerts: ProfileAlert[]) =>
  alerts.filter((a) => a.severity === "required");

describe("household alerts", () => {
  it("is quiet when the household is complete", () => {
    expect(familyAlerts(family(), [guardian(), guardian({ id: "g-2", isPrimary: false })])).toEqual([]);
  });

  it("flags a missing address as required", () => {
    const alerts = familyAlerts(family({ addressLine1: "  " }), [guardian()]);
    expect(labels(required(alerts))).toContain("Home address");
  });

  it("flags a household with nobody reachable", () => {
    const alerts = familyAlerts(family(), [guardian({ email: "", phone: "" })]);
    expect(labels(required(alerts))).toContain("A parent we can reach");
  });

  it("suggests — never requires — a second guardian", () => {
    const alerts = familyAlerts(family(), [guardian()]);
    const second = alerts.find((a) => a.label === "A second parent or guardian");
    expect(second?.severity).toBe("suggested");
  });

  it("requires a phone number for each parent listed", () => {
    const alerts = familyAlerts(family(), [
      guardian(),
      guardian({ id: "g-2", fullName: "Bo Parent", phone: "" }),
    ]);
    expect(labels(required(alerts))).toContain("Phone number for Bo Parent");
  });

  it("requires an emergency contact", () => {
    const alerts = familyAlerts(family({ emergencyContacts: [] }), [guardian()]);
    expect(labels(required(alerts))).toContain("An emergency contact");
  });
});

describe("student alerts", () => {
  it("is quiet for a fully filled student", () => {
    expect(studentAlerts(student())).toEqual([]);
  });

  it("never makes a photo required", () => {
    // Nobody has to put their child's face in the portal to take part.
    const alerts = studentAlerts(student({ headshotUrl: undefined }));
    const photo = alerts.find((a) => a.label === "A photo");
    expect(photo?.severity).toBe("suggested");
    expect(required(alerts)).toEqual([]);
  });

  it("keeps t-shirt size and school out of the red list", () => {
    const alerts = studentAlerts(student({ tshirtSize: undefined, school: "" }));
    expect(required(alerts)).toEqual([]);
    expect(labels(alerts).sort()).toEqual(["School", "T-shirt size"]);
  });

  it("requires legal name, birthday and grade", () => {
    const alerts = studentAlerts(
      student({ firstName: "", lastName: "", dateOfBirth: "", grade: "" })
    );
    expect(labels(required(alerts))).toEqual([
      "Legal first and last name",
      "Date of birth",
      "Grade",
    ]);
  });

  it("names the child in the alert so a two-child family knows whose it is", () => {
    const alerts = studentAlerts(student({ preferredName: "Sammy", tshirtSize: undefined }));
    expect(alerts[0].studentName).toBe("Sammy");
  });
});

describe("health form alerts", () => {
  it("is quiet for a signed, complete, unexpired form", () => {
    expect(healthAlerts(student(), signedForm())).toEqual([]);
  });

  it("requires a form when none exists", () => {
    expect(labels(required(healthAlerts(student(), null)))).toEqual(["Health form"]);
  });

  it("treats an unsigned form as no form", () => {
    // A draft nobody signed is not a medical authorization, however complete.
    const alerts = healthAlerts(student(), signedForm({ signedAt: undefined }));
    expect(labels(required(alerts))).toEqual(["Health form signature"]);
  });

  it("treats a signature with no name as unsigned", () => {
    const alerts = healthAlerts(student(), signedForm({ signedByName: "   " }));
    expect(labels(required(alerts))).toEqual(["Health form signature"]);
  });

  it("requires physician details and treatment consent", () => {
    const alerts = healthAlerts(
      student(),
      signedForm({
        answers: answers({ physicianName: "", emergencyTreatmentConsent: false }),
      })
    );
    expect(labels(required(alerts))).toEqual([
      "Physician name and phone",
      "Emergency treatment consent",
    ]);
  });

  it("flags an expired form as required", () => {
    const alerts = healthAlerts(student(), signedForm({ expiresOn: "2026-01-01" }));
    expect(labels(required(alerts))).toContain("Health form has expired");
  });

  it("warns before expiry rather than on the day", () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const alerts = healthAlerts(student(), signedForm({ expiresOn: soon }));
    const warning = alerts.find((a) => a.label === "Health form expires soon");
    expect(warning?.severity).toBe("suggested");
  });
});

describe("the whole review", () => {
  it("reports 100% for a complete family", () => {
    const review = reviewProfile({
      family: family(),
      guardians: [guardian(), guardian({ id: "g-2", isPrimary: false })],
      students: [student()],
      healthForms: new Map([["stu-1", signedForm()]]),
    });
    expect(review.required).toEqual([]);
    expect(review.percentComplete).toBe(100);
  });

  it("separates red from amber", () => {
    const review = reviewProfile({
      family: family({ emergencyContacts: [] }),
      guardians: [guardian()],
      students: [student({ tshirtSize: undefined })],
      healthForms: new Map([["stu-1", null]]),
    });
    expect(labels(review.required).sort()).toEqual(["An emergency contact", "Health form"]);
    expect(labels(review.suggested)).toContain("T-shirt size");
  });

  it("scores a nearly-done profile far above a barely-started one", () => {
    // Counting only failures made these two read the same; they should not.
    const nearly = reviewProfile({
      family: family(),
      guardians: [guardian(), guardian({ id: "g-2", isPrimary: false })],
      students: [student({ tshirtSize: undefined })],
      healthForms: new Map([["stu-1", signedForm()]]),
    });
    const barely = reviewProfile({
      family: family({ addressLine1: "", city: "", zip: "", emergencyContacts: [] }),
      guardians: [],
      students: [student({ firstName: "", lastName: "", dateOfBirth: "", grade: "", school: "", tshirtSize: undefined, headshotUrl: undefined })],
      healthForms: new Map([["stu-1", null]]),
    });
    expect(nearly.percentComplete).toBeGreaterThan(90);
    expect(barely.percentComplete).toBeLessThan(40);
  });

  it("never returns a percentage outside 0–100", () => {
    const review = reviewProfile({
      family: family({ addressLine1: "", city: "", zip: "", emergencyContacts: [] }),
      guardians: [guardian({ phone: "" }), guardian({ id: "g-2", phone: "" })],
      students: [],
      healthForms: new Map(),
    });
    expect(review.percentComplete).toBeGreaterThanOrEqual(0);
    expect(review.percentComplete).toBeLessThanOrEqual(100);
  });
});
