import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye, Printer } from "lucide-react";
import { getProvider } from "@/lib/api";
import type { ResumeCredit } from "@/lib/api/types";
import { getSessionUser } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AuditionAudioSection,
  HeadshotSection,
  PerformerDetails,
  ResumeBuilder,
  ResumePdfSection,
} from "@/components/materials/student-materials";
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

  const [existing, history] = await Promise.all([
    provider.getAuditionProfile(user.id, student.id, production.id),
    provider.getShowHistory(user.id, student.id),
  ]);
  const displayName = student.preferredName ?? student.firstName;

  // Show history is the source of truth for past roles, so the resume offers
  // them as rows rather than making a parent retype what we already know.
  const suggested: ResumeCredit[] = history.map((entry, index) => ({
    id: `from-history-${index}`,
    category: "role",
    title: `${entry.role} — ${entry.productionTitle}`,
    organization: entry.organization ?? "NOVA PA",
    year: entry.year,
  }));

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

      {/* ── the same performer, whatever the show ────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-5">
        <div>
          <h2 className="text-lg font-semibold">{displayName}&apos;s materials</h2>
          <p className="text-[13px] text-muted-foreground">
            Headshot, resume and recording. These are {displayName}&apos;s, not
            this show&apos;s — change them here and they change everywhere,
            including next season.
          </p>
        </div>
        <Link
          href={`/family/students/${student.id}/resume`}
          className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-accent"
        >
          <Printer aria-hidden className="size-4" />
          Printable resume
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h3" className="text-base">
            Headshot
          </CardTitle>
          <CardDescription>
            We save two versions: one for the app and a 300&nbsp;DPI 8×10 for printing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HeadshotSection student={student} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h3" className="text-base">
            Resume
          </CardTitle>
          <CardDescription>
            Build it here and we&apos;ll format it, or upload a PDF you already have.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <PerformerDetails student={student} />
          <ResumeBuilder student={student} suggested={suggested} />
          <div className="border-t pt-4">
            <ResumePdfSection student={student} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h3" className="text-base">
            Singing recording
          </CardTitle>
          <CardDescription>
            An audio file the team can play without leaving the portal. The
            video for THIS show goes in the form above.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {student.auditionSongUrl && (
            <a
              href={student.auditionSongUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open the video linked on {displayName}&apos;s profile
            </a>
          )}
          <AuditionAudioSection student={student} />
        </CardContent>
      </Card>
    </div>
  );
}
