import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HeadshotSection } from "@/components/materials/student-materials";
import { AuditionForm } from "../../audition-form";

export const metadata = { title: "Audition" };

/**
 * One performer, one show — and everything they audition WITH.
 *
 * A page rather than a section on the child's profile, because an audition
 * belongs to a production: the song, the self-tape and the hopes are all
 * "for Sweeney", and next season they will be different.
 *
 * ---------------------------------------------------------------------------
 * …and the materials came here too
 * ---------------------------------------------------------------------------
 * Tony, 3 Sep 2026: "this should all be on the audition page — not a separate
 * page all together." The headshot, the resume and the singing recording used
 * to live on their own page two clicks into the child's profile, which meant a
 * family preparing an audition had two screens open and no reason to guess that
 * the second one existed.
 *
 * They are still the STUDENT's rather than the show's, and the page says so
 * where they start: the top half is about this production and changes with it,
 * the bottom half follows the child from show to show.
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

  const existing = await provider.getAuditionProfile(
    user.id,
    student.id,
    production.id
  );
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
            else. The videos and the resume are links you own: one is only as
            private as you have set it, so unlisted or link-only is worth a
            moment&apos;s thought.
          </p>
        </CardContent>
      </Card>

      {/* ── the headshot, at the top where it belongs ────────────────────── */}
      {/*
        CJ, 4 Sep 2026: "Move Headshot up to the top where it logically makes
        sense, and eliminate the rest below it."

        Above the form rather than under it: the photo is the first thing the
        panel sees beside a name, and it was the last thing the page asked for.

        The resume builder and the singing-recording card that sat below it are
        gone on the same instruction. The recording duplicated the singing-video
        link the form above already collects for THIS show, and the resume was a
        second place to keep a document nobody had asked a family for at the
        moment they were filling in an audition.
      */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h3" className="text-base">
            Headshot
          </CardTitle>
          <CardDescription>
            The photo the team sees next to {displayName}&apos;s name, here and
            everywhere else in the portal. This one is {displayName}&apos;s
            rather than this show&apos;s — change it here and it changes
            everywhere, including next season.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HeadshotSection student={student} />
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
