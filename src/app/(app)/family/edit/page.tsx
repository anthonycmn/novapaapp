import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { reviewProfile } from "@/lib/profile-completeness";
import { GuardiansEditor } from "@/components/family/guardians-editor";
import { ProfileAlerts } from "@/components/family/profile-alerts";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { FamilyForm } from "./family-form";

export const metadata = { title: "Edit family" };

export default async function EditFamilyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/family");

  const provider = getProvider();
  const season = await provider.getCurrentSeason();
  const [family, guardians, students] = await Promise.all([
    provider.getFamily(user.id, user.familyId),
    provider.getGuardians(user.id, user.familyId),
    provider.getStudentsForFamily(user.id, user.familyId),
  ]);
  if (!family) redirect("/family");


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
    <>
      <SectionHeader
        as="h1"
        title="Edit household"
        subtitle={family.name}
        right={
          <Link
            href="/family"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-muted"
          >
            <ArrowLeft aria-hidden size={14} />
            Back to family
          </Link>
        }
      />

      {/* The same alerts as the family page, so a parent who came here to fix
          one thing can see what else is outstanding without navigating back. */}
      <ProfileAlerts review={review} />

      <div className="flex flex-col gap-4">
        <GuardiansEditor guardians={guardians} />

        <Card pad={false}>
          <SectionHeader
            title="Home address & contact preference"
            inCard
            right={
              <span className="text-[12px] text-muted-foreground">
                Costumes and programs are mailed here
              </span>
            }
          />
          <div className="p-4">
            <FamilyForm family={family} />
          </div>
        </Card>

        {students.length > 0 && (
          <Card pad={false}>
            <SectionHeader
              title="Your students"
              inCard
              right={
                <span className="text-[12px] text-muted-foreground">
                  Names, birthdays, photos and health forms
                </span>
              }
            />
            <ul className="divide-y">
              {students.map((student) => (
                <li key={student.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium">
                      {student.preferredName ?? student.firstName} {student.lastName}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">
                      {student.grade ? `Grade ${student.grade}` : "Grade not set"}
                      {student.school ? ` · ${student.school}` : ""}
                    </span>
                  </span>
                  <Link
                    href={`/family/students/${student.id}/edit`}
                    className="rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors hover:bg-muted"
                  >
                    Edit details
                  </Link>
                  <Link
                    href={`/family/students/${student.id}/health`}
                    className="rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors hover:bg-muted"
                  >
                    Health form
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
