import type { FeedAudience } from "@/lib/api/types";

/**
 * Which parents an audience reaches — the one rule behind every group send
 * (feed posts, Email families, and the push composer's reach count), pulled
 * out of the provider on 10 Oct 2026 so the push page's "this reaches N
 * parents" and the send itself can never disagree.
 *
 *  - an empty audience is every parent;
 *  - a named family is addressed directly, enrolled or not;
 *  - otherwise a parent is in when a student in their family is ENROLLED in
 *    one of the chosen shows or classes, or in anything under a chosen
 *    program. The keys are a union: "Frozen Kids + Acting (9 – 12)" is
 *    every family in either.
 */

export interface AudienceParent {
  family_id?: string | null;
}

export interface AudienceTables {
  students: Array<{ id: string; family_id: string | null }>;
  /** Enrolled rows only. */
  enrollments: Array<{ student_id: string; production_id: string | null; class_id: string | null }>;
  classes: Array<{ id: string; program_id: string | null }>;
  productions: Array<{ id: string; program_id: string | null }>;
}

export function isEveryone(audience: FeedAudience): boolean {
  return (
    !audience.productionIds?.length &&
    !audience.classIds?.length &&
    !audience.programIds?.length &&
    !audience.familyIds?.length
  );
}

export function parentsInAudience<P extends AudienceParent>(
  audience: FeedAudience,
  parents: P[],
  tables: AudienceTables
): P[] {
  if (isEveryone(audience)) return parents;

  const productionIds = new Set((audience.productionIds ?? []).map(String));
  const classIds = new Set((audience.classIds ?? []).map(String));
  const programIds = new Set((audience.programIds ?? []).map(String));
  const familyIds = new Set((audience.familyIds ?? []).map(String));
  const classPrograms = new Map(tables.classes.map((c) => [String(c.id), c.program_id]));
  const productionPrograms = new Map(tables.productions.map((p) => [String(p.id), p.program_id]));
  const familyOf = new Map(tables.students.map((st) => [String(st.id), st.family_id]));

  // Families with at least one student enrolled in something chosen.
  const families = new Set<string>();
  for (const enrollment of tables.enrollments) {
    const familyId = familyOf.get(String(enrollment.student_id));
    if (!familyId) continue;
    const production = enrollment.production_id ? String(enrollment.production_id) : null;
    const klass = enrollment.class_id ? String(enrollment.class_id) : null;
    const program = klass
      ? classPrograms.get(klass)
      : production ? productionPrograms.get(production) : null;
    if (
      (production && productionIds.has(production)) ||
      (klass && classIds.has(klass)) ||
      (program && programIds.has(String(program)))
    ) {
      families.add(String(familyId));
    }
  }

  return parents.filter((parent) => {
    if (!parent.family_id) return false;
    const familyId = String(parent.family_id);
    return familyIds.has(familyId) || families.has(familyId);
  });
}
