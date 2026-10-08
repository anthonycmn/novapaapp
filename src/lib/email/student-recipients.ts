import type { FeedAudience, User } from "@/lib/api/types";

/**
 * Students copied on a staff email — CJ, 5 Oct 2026, from Jen Travis: "include
 * the students in the communication being sent." A parent gives the address on
 * the student's page; the sender ticks "Also send to students".
 *
 * Pure, so both providers and the tests share one rule:
 *  - a student is in the audience by THEIR OWN enrollment, not a sibling's;
 *  - everyone (empty audience) and a named family take every student with an
 *    address, as they take every parent;
 *  - an address already being sent to (a parent's, or a sibling's shared one)
 *    is not sent twice.
 *
 * A student recipient is shaped as a User with role "student" and the
 * student's id, so the delivery loops need no second path. It has no portal
 * login: callers that write notifications must skip role "student".
 */

export interface StudentForEmail {
  id: string;
  familyId: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  email?: string;
  emailOptedOut?: boolean;
  createdAt: string;
}

export interface EnrollmentForEmail {
  studentId: string;
  productionId?: string | null;
  classId?: string | null;
}

export function studentRecipients(
  audience: FeedAudience,
  students: StudentForEmail[],
  enrollments: EnrollmentForEmail[],
  programOf: { classes: Map<string, string | null>; productions: Map<string, string | null> },
  alreadySending: User[]
): User[] {
  if (!audience.includeStudents) return [];
  const isEveryone =
    !audience.productionIds?.length &&
    !audience.classIds?.length &&
    !audience.programIds?.length &&
    !audience.familyIds?.length;

  const seen = new Set(alreadySending.map((u) => u.email.trim().toLowerCase()));
  const out: User[] = [];

  for (const student of students) {
    const email = student.email?.trim().toLowerCase();
    if (!email || seen.has(email)) continue;

    const inAudience =
      isEveryone ||
      Boolean(audience.familyIds?.includes(student.familyId)) ||
      enrollments.some((e) => {
        if (e.studentId !== student.id) return false;
        if (e.productionId && audience.productionIds?.includes(e.productionId)) return true;
        if (e.classId && audience.classIds?.includes(e.classId)) return true;
        if (audience.programIds?.length) {
          const programId = e.classId
            ? programOf.classes.get(e.classId)
            : e.productionId
              ? programOf.productions.get(e.productionId)
              : null;
          if (programId && audience.programIds.includes(programId)) return true;
        }
        return false;
      });
    if (!inAudience) continue;

    seen.add(email);
    out.push({
      id: student.id,
      email,
      displayName: `${student.preferredName || student.firstName} ${student.lastName}`.trim(),
      role: "student",
      familyId: student.familyId,
      emailOptedOut: Boolean(student.emailOptedOut),
      createdAt: student.createdAt,
    });
  }
  return out;
}
