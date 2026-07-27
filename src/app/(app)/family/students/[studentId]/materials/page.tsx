import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { AccessDeniedError, getProvider } from "@/lib/api";
import type { ResumeCredit } from "@/lib/api/types";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AuditionAudioSection,
  HeadshotSection,
  PerformerDetails,
  ResumeBuilder,
  ResumePdfSection,
} from "./materials-forms";

export const metadata = { title: "Audition materials" };

/**
 * Everything a student needs for an audition in one place (#4):
 * headshot, resume, and the audition song.
 */
export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { studentId } = await params;

  const provider = getProvider();
  let student;
  try {
    student = await provider.getStudent(user.id, studentId);
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
  if (!student) notFound();

  const history = await provider.getShowHistory(user.id, studentId);
  // Show history is the source of truth for past roles, so offer them as
  // resume rows rather than making a parent retype what we already know.
  const suggested: ResumeCredit[] = history.map((entry, index) => ({
    id: `from-history-${index}`,
    category: "role",
    title: `${entry.role} — ${entry.productionTitle}`,
    organization: entry.organization ?? "NOVA PA",
    year: entry.year,
  }));

  const displayName = student.preferredName ?? student.firstName;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{displayName}&apos;s materials</h1>
          <p className="text-muted-foreground">Headshot, resume, and audition song.</p>
        </div>
        <Link
          href={`/family/students/${studentId}/resume`}
          className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-accent"
        >
          <Printer aria-hidden className="size-4" />
          Printable resume
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h2" className="text-base">
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
          <CardTitle as="h2" className="text-base">
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
          <CardTitle as="h2" className="text-base">
            Audition song
          </CardTitle>
          <CardDescription>
            {student.auditionSongUrl
              ? "You've linked a video. You can also upload an audio file."
              : "Link a video on the profile page, or upload an audio file here."}
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
              Open linked video
            </a>
          )}
          <AuditionAudioSection student={student} />
        </CardContent>
      </Card>
    </div>
  );
}
