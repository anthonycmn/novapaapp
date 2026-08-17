import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { reviewProfile } from "@/lib/profile-completeness";
import { ProfileAlerts } from "@/components/family/profile-alerts";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Family" };

export default async function FamilyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (!user.familyId) {
    // Staff/admin land here from the tab bar; the staff directory grows in Phase 1.
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Family</h1>
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {hasRoleAtLeast(user, "staff")
              ? "Staff accounts don't have a family profile. Rosters and student lookup arrive with Phase 1."
              : "Your account isn't linked to a family yet. Contact the front office."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const provider = getProvider();
  const season = await provider.getCurrentSeason();
  const [family, students, guardians] = await Promise.all([
    provider.getFamily(user.id, user.familyId),
    provider.getStudentsForFamily(user.id, user.familyId),
    provider.getGuardians(user.id, user.familyId),
  ]);

  if (!family) redirect("/login");

  /**
   * What is still missing, red first. The rules live in one tested module
   * rather than being scattered through this page, because "is this profile
   * complete" is asked here, on the dashboard and by the front office, and
   * three copies of the answer would drift.
   */

  // One health form per student for this season. Per-student rather than the
  // staff-scoped status call, which is keyed by production and would answer a
  // different question.
  const healthForms = new Map(
    await Promise.all(
      students.map(
        async (student) =>
          [student.id, await provider.getHealthForm(user.id, student.id, season.id)] as const
      )
    )
  );

  const review = reviewProfile({
    family,
    guardians,
    students,
    healthForms,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{family.name}</h1>
        <Link
          href="/family/edit"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Pencil aria-hidden size={13} />
          Edit family
        </Link>
      </div>

      <ProfileAlerts review={review} />

      <section aria-labelledby="fam-students">
        <h2 id="fam-students" className="mb-2 text-lg font-semibold">Students</h2>
        <div className="flex flex-col gap-2">
          {students.map((student) => (
            <Link key={student.id} href={`/family/students/${student.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <Avatar
                    name={`${student.firstName} ${student.lastName}`}
                    src={student.headshotUrl}
                  />
                  <div>
                    <p className="font-medium">
                      {student.preferredName ?? student.firstName} {student.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Grade {student.grade}
                      {student.school ? ` · ${student.school}` : ""}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Guardians</CardTitle>
          <CardDescription>People who can manage this family account.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0">
          {guardians.map((guardian) => (
            <div key={guardian.id} className="flex items-center gap-3">
              <Avatar name={guardian.fullName} className="size-9 text-xs" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {guardian.fullName}
                  {guardian.isPrimary && (
                    <span className="ml-2 text-xs text-muted-foreground">Primary</span>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {guardian.relationship} · {guardian.email}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Household</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm">
          <p>{family.addressLine1}</p>
          {family.addressLine2 && <p>{family.addressLine2}</p>}
          <p>
            {family.city}, {family.state} {family.zip}
          </p>
          <p className="mt-2 text-muted-foreground">
            Preferred contact: {family.preferredContactMethod.toUpperCase()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
