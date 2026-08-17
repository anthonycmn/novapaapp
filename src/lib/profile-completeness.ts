import type { Family, Guardian, HealthForm, Student } from "@/lib/api/types";

/**
 * What is missing from a family's profile, and how much it matters.
 *
 * Tony, 17 Aug 2026: "leaves red alerts around things that are not complete."
 *
 * Two severities, and the line between them is deliberate:
 *
 *   "required" — we cannot run a rehearsal safely or reach this family without
 *   it. A missing allergy answer or an unsigned health form is a child at a
 *   snack table nobody can vouch for. These go red.
 *
 *   "suggested" — genuinely useful, genuinely optional. A t-shirt size, a
 *   photo. These go amber, and never red: a portal that shouts about a missing
 *   headshot teaches parents to ignore it, and then the allergy warning gets
 *   ignored too. Alert fatigue is how the important one gets missed.
 *
 * A photo is never required. Nobody has to put their child's face — or their
 * own — in the portal to take part.
 */

export type AlertSeverity = "required" | "suggested";

export interface ProfileAlert {
  severity: AlertSeverity;
  /** What is missing, in the parent's words. */
  label: string;
  /** Why we're asking, so it doesn't read as busywork. */
  why: string;
  /** Where to go and fix it. */
  href: string;
  /** Which student it belongs to, when it is student-scoped. */
  studentId?: string;
  studentName?: string;
}

function blank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

/** Household-level gaps: where we post things, and how we reach a grown-up. */
export function familyAlerts(
  family: Family | null | undefined,
  guardians: Guardian[]
): ProfileAlert[] {
  const alerts: ProfileAlert[] = [];
  if (!family) return alerts;

  if (blank(family.addressLine1) || blank(family.city) || blank(family.zip)) {
    alerts.push({
      severity: "required",
      label: "Home address",
      why: "Costume shipments and mailed programs go here.",
      href: "/family/edit",
    });
  }

  const contactable = guardians.filter((g) => !blank(g.email) || !blank(g.phone));
  if (contactable.length === 0) {
    alerts.push({
      severity: "required",
      label: "A parent we can reach",
      why: "Nobody on this household has an email address or phone number.",
      href: "/family/edit",
    });
  }

  // One reachable grown-up is a single point of failure on a show night.
  if (contactable.length === 1) {
    alerts.push({
      severity: "suggested",
      label: "A second parent or guardian",
      why: "If we cannot reach the first person during a rehearsal, we have nobody else to call.",
      href: "/family/edit",
    });
  }

  for (const guardian of guardians) {
    if (blank(guardian.phone)) {
      alerts.push({
        severity: "required",
        label: `Phone number for ${guardian.fullName || "a parent"}`,
        why: "Show-week changes go out by text, and emergencies go out by phone.",
        href: "/family/edit",
      });
    }
  }

  if ((family.emergencyContacts ?? []).length === 0) {
    alerts.push({
      severity: "required",
      label: "An emergency contact",
      why: "Someone other than a parent we can call if we cannot reach you.",
      href: "/family/edit",
    });
  }

  return alerts;
}

/** Per-child gaps, profile side. Health forms are handled separately. */
export function studentAlerts(student: Student): ProfileAlert[] {
  const name = student.preferredName ?? student.firstName;
  const base = { studentId: student.id, studentName: name };
  const alerts: ProfileAlert[] = [];

  if (blank(student.firstName) || blank(student.lastName)) {
    alerts.push({
      ...base,
      severity: "required",
      label: "Legal first and last name",
      why: "It has to match the registration record, or their enrollment stops matching up.",
      href: `/family/students/${student.id}/edit`,
    });
  }

  if (blank(student.dateOfBirth)) {
    alerts.push({
      ...base,
      severity: "required",
      label: "Date of birth",
      why: "Casting, age-group placement and medical release all depend on it.",
      href: `/family/students/${student.id}/edit`,
    });
  }

  if (blank(student.grade)) {
    alerts.push({
      ...base,
      severity: "required",
      label: "Grade",
      why: "Placement in the right group for the season.",
      href: `/family/students/${student.id}/edit`,
    });
  }

  if (blank(student.school)) {
    alerts.push({
      ...base,
      severity: "suggested",
      label: "School",
      why: "Helps us plan around early releases and exam weeks.",
      href: `/family/students/${student.id}/edit`,
    });
  }

  if (blank(student.tshirtSize)) {
    alerts.push({
      ...base,
      severity: "suggested",
      label: "T-shirt size",
      why: "Cast shirts get ordered in one batch, weeks before opening.",
      href: `/family/students/${student.id}/edit`,
    });
  }

  if (blank(student.headshotUrl)) {
    alerts.push({
      ...base,
      severity: "suggested",
      label: "A photo",
      why: "Helps staff put a face to a name at check-in. Entirely optional.",
      href: `/family/students/${student.id}/edit`,
    });
  }

  return alerts;
}

/**
 * The health form, which is the one that actually matters.
 *
 * An unsigned form is treated the same as a missing one: a draft nobody signed
 * is not a medical authorization, however complete it looks.
 */
export function healthAlerts(student: Student, form: HealthForm | null): ProfileAlert[] {
  const name = student.preferredName ?? student.firstName;
  const href = `/family/students/${student.id}/health`;
  const base = { studentId: student.id, studentName: name };

  if (!form) {
    return [
      {
        ...base,
        severity: "required",
        label: "Health form",
        why: "We cannot take a child into a rehearsal without one on file for this season.",
        href,
      },
    ];
  }

  if (!form.signedAt || blank(form.signedByName)) {
    return [
      {
        ...base,
        severity: "required",
        label: "Health form signature",
        why: "The answers are saved but unsigned — an unsigned form is not a medical authorization.",
        href,
      },
    ];
  }

  const alerts: ProfileAlert[] = [];
  const answers = form.answers;

  if (blank(answers.physicianName) || blank(answers.physicianPhone)) {
    alerts.push({
      ...base,
      severity: "required",
      label: "Physician name and phone",
      why: "The first call an urgent-care desk asks us to make.",
      href,
    });
  }

  if (!answers.emergencyTreatmentConsent) {
    alerts.push({
      ...base,
      severity: "required",
      label: "Emergency treatment consent",
      why: "Without it we cannot authorise treatment while we are reaching you.",
      href,
    });
  }

  if (blank(answers.insuranceCarrier)) {
    alerts.push({
      ...base,
      severity: "suggested",
      label: "Insurance carrier",
      why: "Saves time at an urgent-care desk.",
      href,
    });
  }

  // Expiry: warn a month out rather than on the day it lapses.
  const expires = Date.parse(`${form.expiresOn}T12:00:00Z`);
  if (Number.isFinite(expires)) {
    const daysLeft = Math.ceil((expires - Date.now()) / 86_400_000);
    if (daysLeft < 0) {
      alerts.push({
        ...base,
        severity: "required",
        label: "Health form has expired",
        why: `It lapsed ${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? "day" : "days"} ago and needs signing again.`,
        href,
      });
    } else if (daysLeft <= 30) {
      alerts.push({
        ...base,
        severity: "suggested",
        label: "Health form expires soon",
        why: `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left before it needs signing again.`,
        href,
      });
    }
  }

  return alerts;
}

export interface ProfileReview {
  alerts: ProfileAlert[];
  required: ProfileAlert[];
  suggested: ProfileAlert[];
  /** 0–100, required items weighted three times a suggested one. */
  percentComplete: number;
}

/** Everything, in one pass, for the family profile page. */
export function reviewProfile({
  family,
  guardians,
  students,
  healthForms,
}: {
  family: Family | null | undefined;
  guardians: Guardian[];
  students: Student[];
  /** studentId → this season's form, or null when there is none. */
  healthForms: Map<string, HealthForm | null>;
}): ProfileReview {
  const alerts = [
    ...familyAlerts(family, guardians),
    ...students.flatMap((student) => [
      ...studentAlerts(student),
      ...healthAlerts(student, healthForms.get(student.id) ?? null),
    ]),
  ];

  const required = alerts.filter((alert) => alert.severity === "required");
  const suggested = alerts.filter((alert) => alert.severity === "suggested");

  /*
   * The denominator is what a complete profile would have looked like — the
   * checks that passed plus the ones that failed. Counting only failures makes
   * a profile with one gap and a profile with twenty both read as "incomplete"
   * at the same number, which tells a parent nothing about how close they are.
   */
  const REQUIRED_CHECKS = 4 + students.length * 4;
  const SUGGESTED_CHECKS = 1 + students.length * 4;
  const requiredPassed = Math.max(0, REQUIRED_CHECKS - required.length);
  const suggestedPassed = Math.max(0, SUGGESTED_CHECKS - suggested.length);
  const earned = requiredPassed * 3 + suggestedPassed;
  const possible = REQUIRED_CHECKS * 3 + SUGGESTED_CHECKS;

  return {
    alerts,
    required,
    suggested,
    percentComplete: possible === 0 ? 100 : Math.round((earned / possible) * 100),
  };
}
