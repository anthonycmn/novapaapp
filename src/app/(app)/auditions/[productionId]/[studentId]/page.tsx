import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { AuditionForm } from "../../audition-form";

export const metadata = { title: "Audition" };

/**
 * One performer, one show — the auditions tab.
 *
 * A page rather than a section on the child's profile, because an audition
 * belongs to a production: the song, the self-tape and the hopes are all
 * "for Sweeney", and next season they will be different. The child's profile
 * keeps what is permanent about them; this keeps what is true about this show.
 */
export default async function AuditionPage({
  params,
}: {
  params: Promise<{ productionId: string; studentId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/auditions");
  const { productionId, studentId } = await params;

  const provider = getProvider();
  const [students, production] = await Promise.all([
    provider.getStudentsForFamily(user.id, user.familyId),
    provider.getProduction(productionId),
  ]);

  const student = students.find((entry) => entry.id === studentId);
  if (!student || !production) notFound();

  /*
   * Auditions are only offered for a show this child is actually registered
   * for. Without this the URL alone would open a form against any production
   * in the season, and a submission nobody asked for is worse than a 404.
   */
  const enrollments = await provider.getEnrollmentsForStudent(user.id, student.id);
  const registered = enrollments.some(
    (enrollment) =>
      enrollment.productionId === production.id && enrollment.status === "enrolled"
  );
  if (!registered) notFound();

  const existing = await provider.getAuditionProfile(user.id, student.id, production.id);
  const displayName = student.preferredName ?? student.firstName;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/auditions"
          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden size={14} /> All auditions
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">
          {displayName} — {production.title}
        </h1>
        <p className="text-muted-foreground">
          Everything on this page is for this show. You can come back and change
          it until auditions begin.
        </p>
      </div>

      {/* Say plainly who reads it. A parent handing over video of their child
          singing in a kitchen is owed that before they press the button — and
          now that the videos are the family's own links, it has to say who can
          open one, because that part is their decision rather than ours. */}
      <Card className="gold-band">
        <CardContent className="flex items-start gap-2 p-4 text-[13px]">
          <Eye aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>
            This goes to the directing team for {production.title} — nobody
            else. The resume is stored privately here. The video links are
            yours: one is only as private as you have set it, so unlisted or
            link-only is worth a moment&apos;s thought.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <AuditionForm
            studentId={student.id}
            productionId={production.id}
            studentName={displayName}
            existing={existing}
          />
        </CardContent>
      </Card>
    </div>
  );
}
