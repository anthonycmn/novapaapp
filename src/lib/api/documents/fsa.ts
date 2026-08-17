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

/**
 * The only kind of fee that goes on the statement.
 *
 * Tony, 17 Aug 2026: "only camp fees on the FSA statement."
 *
 * That matches the rule rather than merely following an instruction: a
 * Dependent Care FSA reimburses care that lets a parent work, which day camp
 * is. A weekly after-school class, a private lesson and a performance ticket
 * are not, at any age.
 *
 * The comparison is deliberately exact. An enrollment with NO category is one
 * we could not classify, and it is left off — on a document a family files with
 * the IRS, "we are not sure" has to mean "not claimed".
 */
export const FSA_ELIGIBLE_CATEGORY = "camp";

export function isFsaEligibleFee(offeringCategory: string | undefined): boolean {
  return offeringCategory?.trim().toLowerCase() === FSA_ELIGIBLE_CATEGORY;
}

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
  /**
   * Override the paid figure per enrollment. Used by tests and by a total
   * corrected by hand; the snapshot value on the enrollment is the default.
   */
  paidByEnrollmentId?: Record<string, number>;
}

export function buildFsaStatement(input: FsaInput): FsaStatement {
  const { student, family, guardians, enrollments, classes, productions } = input;

  const classById = new Map(classes.map((offering) => [offering.id, offering]));
  const productionById = new Map(productions.map((production) => [production.id, production]));

  const mine = enrollments
    .filter((enrollment) => enrollment.studentId === student.id)
    .filter((enrollment) => enrollment.status !== "withdrawn");

  // Everything this child is enrolled in that is NOT qualifying care. Counted
  // rather than discarded, so the statement can say what it left out instead of
  // a parent wondering why a fee they remember paying is missing.
  const excludedCount = mine.filter(
    (enrollment) => !isFsaEligibleFee(enrollment.offeringCategory)
  ).length;

  const campEnrollments = mine.filter((enrollment) =>
    isFsaEligibleFee(enrollment.offeringCategory)
  );

  const lineItems: FsaLineItem[] = campEnrollments
    .map((enrollment) => {
      const offering = enrollment.classId ? classById.get(enrollment.classId) : undefined;
      const production = enrollment.productionId
        ? productionById.get(enrollment.productionId)
        : undefined;

      const description = offering?.name ?? production?.title ?? "Program";
      /*
       * When the care actually happened, best source first.
       *
       * 1. The session dates captured from the catalogue at sync time. These
       *    are the real week of camp and the only ones that survive the
       *    catalogue rolling over to next season.
       * 2. The production's own run, for a show.
       * 3. The tax-year range — imprecise but true. An administrator reads it
       *    as "sometime in this plan year", which beats a confident wrong week.
       */
      const startDate =
        enrollment.sessionStartsOn ?? production?.opensOn ?? input.periodStart;
      const endDate =
        enrollment.sessionEndsOn ?? production?.closesOn ?? input.periodEnd;
      /** True when we are falling back to the whole year rather than real dates. */
      const datesApproximate =
        !enrollment.sessionStartsOn && !production?.opensOn;

      /*
       * What they actually paid, from the registration system.
       *
       * The old fallback was max(0, -balance), which is ZERO for anything paid
       * in full — so a real statement would have listed a family's camps at
       * $0.00 each. An override is still honoured for tests and for a figure
       * corrected by hand, but the snapshot is the source now.
       */
      const paid =
        input.paidByEnrollmentId?.[enrollment.id] ?? enrollment.amountPaidCents;

      return {
        description,
        startDate,
        endDate,
        amountCents: paid ?? 0,
        /** True when no payment record exists — reported, not silently zeroed. */
        amountUnknown: paid === undefined,
        datesApproximate,
      };
    });

  const ageAtPeriodEnd = ageOn(student.dateOfBirth, input.periodEnd);
  const tooOld = ageAtPeriodEnd >= FSA_AGE_LIMIT;
  /*
   * Two independent tests, and both have to pass. Age is the IRS one; the
   * category decides whether what was bought is care at all.
   *
   * Eligibility turns on HAVING a camp enrollment, not on our being able to
   * price it. A camp paid in full leaves a zero balance, and with no payment
   * records yet that produces no priced line — telling such a family they do
   * not qualify would be wrong about the law, not merely about the total.
   */
  const eligible = !tooOld && campEnrollments.length > 0;

  const primary = guardians.find((guardian) => guardian.isPrimary) ?? guardians[0];

  return {
    studentId: student.id,
    studentName: `${student.firstName} ${student.lastName}`,
    studentDateOfBirth: student.dateOfBirth,
    ageAtPeriodEnd,
    eligible,
    ineligibleReason: eligible
      ? undefined
      : tooOld
        ? `Dependent Care FSA covers children under ${FSA_AGE_LIMIT}. ${student.firstName} is ${ageAtPeriodEnd} at the end of this period.`
        : `A Dependent Care FSA reimburses care that lets a parent work, which means day camp. ${student.firstName} has no camp fees in this period` +
          (excludedCount > 0
            ? ` — the ${excludedCount} other ${
                excludedCount === 1 ? "enrollment is a class, lesson or performance" : "enrollments are classes, lessons or performances"
              }, which do not qualify at any age.`
            : "."),
    excludedCount,
    familyName: family.name,
    guardianName: primary?.fullName ?? "",
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    lineItems,
    totalCents: lineItems.reduce((sum, item) => sum + item.amountCents, 0),
    unpricedCount: lineItems.filter((item) => item.amountUnknown).length,
    approximateDateCount: lineItems.filter((item) => item.datesApproximate).length,
    generatedAt: new Date().toISOString(),
  };
}
