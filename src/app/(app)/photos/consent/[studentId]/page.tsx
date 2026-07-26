import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDeniedError, getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { revokeConsentAction } from "@/lib/actions/photos";
import { formatEventTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConsentExplanation } from "./explanation";
import { ConsentForm } from "./consent-form";

export const metadata = { title: "Photo matching" };

export default async function ConsentPage({
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

  const studentName = student.preferredName ?? student.firstName;
  const [history, embeddingCount] = await Promise.all([
    provider.getConsentHistory(user.id, studentId),
    provider.countEmbeddingsForStudent(user.id, studentId),
  ]);
  const lastRevocation = history.find((event) => event.action === "revoked");

  if (student.consents.faceMatching) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">
          Photo matching for {studentName}
        </h1>

        <Card className="border-primary/40">
          <CardContent className="p-5">
            <p className="font-medium">Turned on ✓</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;re looking for {studentName} in new galleries.{" "}
              {embeddingCount} face {embeddingCount === 1 ? "signature" : "signatures"}{" "}
              stored from your reference photos.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Turn it off</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0">
            <p className="text-sm">
              Switching this off deletes {studentName}&apos;s face signatures,
              your reference photos, and every match — right away. You&apos;ll
              see exactly what was removed.
            </p>
            <form action={revokeConsentAction.bind(null, studentId)}>
              <Button type="submit" variant="destructive">
                Turn off and delete {studentName}&apos;s face data
              </Button>
            </form>
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pt-0 text-sm">
              {history.map((event) => (
                <div key={event.id} className="border-b pb-2 last:border-b-0 last:pb-0">
                  <p className="font-medium capitalize">{event.action}</p>
                  <p className="text-muted-foreground">
                    {formatEventTime(event.createdAt)} · {event.actorName}
                  </p>
                  {event.action === "revoked" && (
                    <p className="text-muted-foreground">
                      Deleted {event.embeddingsDeleted} face signature
                      {event.embeddingsDeleted === 1 ? "" : "s"},{" "}
                      {event.referencePhotosDeleted} reference photo
                      {event.referencePhotosDeleted === 1 ? "" : "s"},{" "}
                      {event.matchesDeleted} match
                      {event.matchesDeleted === 1 ? "" : "es"}.
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Link href="/photos" className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline">
          Back to photos
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">
          Find photos of {studentName} automatically
        </h1>
        <p className="text-muted-foreground">
          Optional. Read this first — then decide.
        </p>
      </div>

      {lastRevocation && (
        <Card className="border-muted">
          <CardContent className="p-4 text-sm text-muted-foreground">
            You turned this off on {formatEventTime(lastRevocation.createdAt)} and
            we deleted {lastRevocation.embeddingsDeleted} face signature
            {lastRevocation.embeddingsDeleted === 1 ? "" : "s"}. Turning it back
            on starts fresh with new reference photos.
          </CardContent>
        </Card>
      )}

      <ConsentExplanation studentName={studentName} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ready to turn it on?</CardTitle>
        </CardHeader>
        <CardContent>
          <ConsentForm studentId={studentId} studentName={studentName} />
        </CardContent>
      </Card>
    </div>
  );
}
