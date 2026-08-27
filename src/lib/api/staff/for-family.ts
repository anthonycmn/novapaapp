import type {
  ClassOffering,
  Enrollment,
  Production,
  StaffAssignment,
  StaffProfile,
  Student,
} from "../types";

/**
 * Who actually teaches this family's children — pure, so the rules below are
 * testable without a database.
 *
 * The whole point is subtraction. The org has fifteen active staff and
 * twenty-four shows; a family has one or two children in one or two of them.
 * Showing the company directory answers a question nobody asked and buries the
 * one they did: who is in the room with my child.
 */

export interface StaffForFamilyInput {
  students: Student[];
  enrollments: Enrollment[];
  productions: Production[];
  classes: ClassOffering[];
  /** family_hub.production_staff — who holds which job on which show. */
  productionStaff: Array<{ productionId: string; staffId: string; role?: string }>;
  profiles: StaffProfile[];
}

export function staffForFamily(input: StaffForFamilyInput): StaffAssignment[] {
  const nameOf = new Map(
    input.students.map((student) => [
      student.id,
      student.preferredName?.trim() || student.firstName,
    ])
  );
  const profileById = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const productionById = new Map(input.productions.map((p) => [p.id, p]));
  const classById = new Map(input.classes.map((c) => [c.id, c]));

  // A withdrawn enrollment is not a room your child is in.
  const active = input.enrollments.filter(
    (enrollment) => enrollment.status !== "withdrawn"
  );

  /** production/class id → the children of this family who are in it. */
  const studentsByOffering = new Map<string, Set<string>>();
  for (const enrollment of active) {
    const key = enrollment.productionId ?? enrollment.classId;
    if (!key) continue;
    const name = nameOf.get(enrollment.studentId);
    if (!name) continue; // a child from another family; not ours to show
    const set = studentsByOffering.get(key) ?? new Set<string>();
    set.add(name);
    studentsByOffering.set(key, set);
  }

  /** staffId → the roles they hold across this family's offerings. */
  const byStaff = new Map<string, StaffAssignment["roles"]>();
  const add = (staffId: string, role: StaffAssignment["roles"][number]) => {
    const list = byStaff.get(staffId) ?? [];
    list.push(role);
    byStaff.set(staffId, list);
  };

  for (const [offeringId, studentSet] of studentsByOffering) {
    const studentNames = [...studentSet].sort((a, b) => a.localeCompare(b));

    const production = productionById.get(offeringId);
    if (production) {
      // The show's own creative team, plus the director, who is recorded on
      // the production rather than in the assignment table.
      const seen = new Set<string>();
      for (const assignment of input.productionStaff) {
        if (assignment.productionId !== production.id) continue;
        seen.add(assignment.staffId);
        add(assignment.staffId, {
          offering: production.title,
          href: `/productions/${production.id}`,
          role: assignment.role?.trim() || undefined,
          studentNames,
        });
      }
      if (production.directorStaffId && !seen.has(production.directorStaffId)) {
        add(production.directorStaffId, {
          offering: production.title,
          href: `/productions/${production.id}`,
          role: "Director",
          studentNames,
        });
      }
      continue;
    }

    const offering = classById.get(offeringId);
    if (offering) {
      for (const staffId of offering.staffIds) {
        add(staffId, {
          offering: offering.name,
          href: `/classes/${offering.id}`,
          // No role: on a class, teaching it IS the job, and "Teacher on
          // Acting (9–12)" is a word doing no work.
          studentNames,
        });
      }
    }
  }

  const assignments: StaffAssignment[] = [];
  for (const [staffId, roles] of byStaff) {
    const profile = profileById.get(staffId);
    // A role pointing at a profile that does not exist is a bridge gap, not a
    // person. Showing a blank card would invent a colleague.
    if (!profile) continue;
    assignments.push({
      profile,
      roles: roles.sort(
        (a, b) =>
          a.offering.localeCompare(b.offering) ||
          (a.role ?? "").localeCompare(b.role ?? "")
      ),
    });
  }

  /*
   * Most-involved first: somebody holding four jobs on your child's show is
   * more use at the top than somebody who covers one. Ties break on name so
   * the order never shuffles between page loads.
   */
  return assignments.sort(
    (a, b) =>
      b.roles.length - a.roles.length ||
      a.profile.fullName.localeCompare(b.profile.fullName)
  );
}

/**
 * The line under a name: "Vocal Director · Costume Designer on Frozen, Kids".
 *
 * Grouped by offering rather than listed flat, because a parent reads the show
 * name as the context and the jobs as the detail — the other way round makes
 * them read the show title three times.
 */
export function describeRoles(assignment: StaffAssignment): string {
  const byOffering = new Map<string, string[]>();
  for (const role of assignment.roles) {
    const list = byOffering.get(role.offering) ?? [];
    if (role.role) list.push(role.role);
    byOffering.set(role.offering, list);
  }
  return [...byOffering.entries()]
    .map(([offering, roles]) =>
      roles.length > 0 ? `${roles.join(" · ")} on ${offering}` : `Teaches ${offering}`
    )
    .join(" — ");
}
