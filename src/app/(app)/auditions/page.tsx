import { redirect } from "next/navigation";
import { Drama } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { EmptyState } from "@/components/ui/states";
import { OfferingTile } from "@/components/productions/offering-tile";

export const metadata = { title: "Auditions" };

/**
 * One card per performer per show they are auditioning for.
 *
 * The audition itself lives on its own page now — see the note there. This is
 * the way in, and it says at a glance which are done and which are not, since
 * "did I actually submit that?" is the question a parent opens this page with.
 */
export default async function AuditionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Casting left this app on 26 Aug 2026 — it is run from the staff portal now.
  // A staff member here has no audition roster to be sent to, so they go home
  // rather than to a route that no longer exists.
  if (!user.familyId) redirect("/");

  const provider = getProvider();
  const [students, productions] = await Promise.all([
    provider.getStudentsForFamily(user.id, user.familyId),
    provider.getProductions(),
  ]);

  // A 13+ student with their own login submits for themself only.
  const visibleStudents =
    user.role === "student" ? students.filter((student) => student.hasLogin) : students;

  const rows = (
    await Promise.all(
      visibleStudents.map(async (student) => {
        const enrollments = await provider.getEnrollmentsForStudent(user.id, student.id);
        return Promise.all(
          enrollments
            .filter(
              (enrollment) => enrollment.status === "enrolled" && enrollment.productionId
            )
            .map(async (enrollment) => {
              const production = productions.find((p) => p.id === enrollment.productionId);
              if (!production) return null;
              const existing = await provider.getAuditionProfile(
                user.id,
                student.id,
                production.id
              );
              return { student, production, existing };
            })
        );
      })
    )
  )
    .flat()
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Auditions</h1>
        <p className="text-muted-foreground">
          Tell each show&apos;s directing team about your performer.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Drama aria-hidden className="size-8" />}
          title="No shows to audition for"
          description="When your child is registered for a show, its audition form appears here."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(({ student, production, existing }) => {
            const displayName = student.preferredName ?? student.firstName;
            /*
             * "Submitted" is not the same as "finished". A family often saves
             * the words on Tuesday and uploads the tape on Sunday, so the
             * badge distinguishes the two rather than calling the first one
             * done and letting a missing video go unnoticed.
             */
            const hasFiles = Boolean(
              existing?.auditionVideoUrl || existing?.danceVideoUrl || existing?.resumeUrl
            );
            return (
              <OfferingTile
                key={`${student.id}-${production.id}`}
                href={`/auditions/${production.id}/${student.id}`}
                Icon={Drama}
                title={`${displayName} — ${production.title}`}
                subtitle={
                  existing
                    ? hasFiles
                      ? "Submitted, with recordings"
                      : "Submitted — you can still add a video or resume"
                    : "Not started"
                }
                meta={existing?.songTitle ? `Song: ${existing.songTitle}` : undefined}
                badge={existing ? undefined : "To do"}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
