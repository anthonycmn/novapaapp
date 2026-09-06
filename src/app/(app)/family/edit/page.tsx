import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { loadProfileReview } from "@/lib/profile-review";
import { EmergencyContactsEditor } from "@/components/family/emergency-contacts-editor";
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

  // One loader for the review data — shared with /family and the dashboard
  // panel (lib/profile-review), so the three surfaces cannot drift.
  const loaded = await loadProfileReview(user.id, user.familyId);
  if (!loaded) redirect("/family");
  const { family, guardians, students, review } = loaded;

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

        {/* The red alert for "an emergency contact" has always pointed here.
            Until this existed there was nothing on the page to answer it. */}
        <EmergencyContactsEditor contacts={family.emergencyContacts ?? []} />

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
