import type { Enrollment, Family, Guardian, Student } from "../types";
import type { ClassOffering, Production } from "../types";
import type { FsaLineItem, FsaStatement } from "./types";

/**
 * Builds a Dependent Care FSA statement (pure — unit tested).
 *
 * Eligibility: the dependent must be under 13 when the care was provided.
 * We test age at the END of the covered period, which is the conservative
 * reading — a child who turns 13 mid-year is only eligible for the portion
 * before their birthday, and we'd rather flag that for a human than quietly
 * over-claim on a family's tax paperwork.
 */

export const FSA_AGE_LIMIT = 13;

export function ageOn(dateOfBirth: string, on: string): number {
  const birth = new Date(dateOfBirth);
  const at = new Date(on);
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = at.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && at.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export interface FsaInput {
  student: Student;
  family: Family;
  guardians: Guardian[];
  enrollments: Enrollment[];
  classes: ClassOffering[];
  productions: Production[];
  periodStart: string;
  periodEnd: string;
  /** Amount actually paid per enrollment, in cents. */
  paidByEnrollmentId?: Record<string, number>;
}

export function buildFsaStatement(input: FsaInput): FsaStatement {
  const { student, family, guardians, enrollments, classes, productions } = input;

  const classById = new Map(classes.map((offering) => [offering.id, offering]));
  const productionById = new Map(productions.map((production) => [production.id, production]));

  const lineItems: FsaLineItem[] = enrollments
    .filter((enrollment) => enrollment.studentId === student.id)
    .filter((enrollment) => enrollment.status !== "withdrawn")
    .map((enrollment) => {
      const offering = enrollment.classId ? classById.get(enrollment.classId) : undefined;
      const production = enrollment.productionId
        ? productionById.get(enrollment.productionId)
        : undefined;

      const description = offering?.name ?? production?.title ?? "Program";
      // Productions carry real dates; classes run the whole period.
      const startDate = production?.opensOn ?? input.periodStart;
      const endDate = production?.closesOn ?? input.periodEnd;

      const paid =
        input.paidByEnrollmentId?.[enrollment.id] ??
        // Fall back to what we know: total charged minus what's still owed.
        Math.max(0, -enrollment.balanceCents);

      return { description, startDate, endDate, amountCents: paid };
    })
    .filter((item) => item.amountCents > 0);

  const ageAtPeriodEnd = ageOn(student.dateOfBirth, input.periodEnd);
  const eligible = ageAtPeriodEnd < FSA_AGE_LIMIT;

  const primary = guardians.find((guardian) => guardian.isPrimary) ?? guardians[0];

  return {
    studentId: student.id,
    studentName: `${student.firstName} ${student.lastName}`,
    studentDateOfBirth: student.dateOfBirth,
    ageAtPeriodEnd,
    eligible,
    ineligibleReason: eligible
      ? undefined
      : `Dependent Care FSA covers children under ${FSA_AGE_LIMIT}. ${student.firstName} is ${ageAtPeriodEnd} at the end of this period.`,
    familyName: family.name,
    guardianName: primary?.fullName ?? "",
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    lineItems,
    totalCents: lineItems.reduce((sum, item) => sum + item.amountCents, 0),
    generatedAt: new Date().toISOString(),
  };
}
