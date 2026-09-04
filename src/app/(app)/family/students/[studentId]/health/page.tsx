import { notFound, redirect } from "next/navigation";
import { AccessDeniedError, getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthFormEditor } from "./health-form";
import { currentImpersonation } from "@/lib/auth/impersonation";
import { BlockedWhileImpersonating } from "@/components/blocked-while-impersonating";

export const metadata = { title: "Health form" };

export default async function HealthFormPage({
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

  const season = await provider.getCurrentSeason();
  const [current, previous] = await Promise.all([
    provider.getHealthForm(user.id, studentId, season.id),
    provider.getPreviousHealthForm(user.id, studentId, season.id),
  ]);

  const displayName = student.preferredName ?? student.firstName;

  /* Hub 0063 — a Chief standing in for this family may read all of this
     and submit none of it. */
  const standingIn = Boolean(await currentImpersonation());

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">
          Health & safety form
        </h1>
        <p className="text-muted-foreground">
          {displayName} · {season.name}
        </p>
      </div>

      {current?.signedAt && (
        <Card className="border-primary/40">
          <CardContent className="p-4 text-sm">
            <p className="font-medium">On file ✓</p>
            <p className="text-muted-foreground">
              Signed by {current.signedByName} on {formatDate(current.signedAt)} ·
              expires {formatDate(current.expiresOn)}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {current ? "Update this season's form" : "Complete for this season"}
          </CardTitle>
          <CardDescription>
            Medical details are visible to NOVA PA staff for safety purposes
            and to no one else.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {standingIn ? (
            <BlockedWhileImpersonating action="health" title="The health form" />
          ) : (
            <HealthFormEditor
              studentId={student.id}
              seasonId={season.id}
              studentName={displayName}
              current={current}
              previous={previous}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
