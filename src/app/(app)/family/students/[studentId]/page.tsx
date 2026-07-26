import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDeniedError, getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Student" };

export default async function StudentPage({
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

  const [casting, history, hopes] = await Promise.all([
    provider.getCastingForStudent(user.id, studentId),
    provider.getShowHistory(user.id, studentId),
    provider.getHopes(user.id, studentId),
  ]);

  const displayName = student.preferredName ?? student.firstName;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar
          name={`${student.firstName} ${student.lastName}`}
          src={student.headshotUrl}
          className="size-16 text-lg"
        />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">
            {displayName} {student.lastName}
          </h1>
          <p className="text-muted-foreground">
            Grade {student.grade}
            {student.pronouns ? ` · ${student.pronouns}` : ""}
          </p>
        </div>
        <Link
          href={`/family/students/${student.id}/edit`}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Edit
        </Link>
      </div>

      {casting.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Current casting</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0">
            {casting.map((assignment) => (
              <div key={assignment.id} className="flex items-center justify-between gap-2">
                <p className="font-medium">{assignment.characterName}</p>
                <div className="flex gap-1">
                  {assignment.isUnderstudy && <Badge variant="secondary">Understudy</Badge>}
                  {assignment.rehearsalTrack && (
                    <Badge variant="outline">{assignment.rehearsalTrack}</Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Show history</CardTitle>
          <CardDescription>
            Auto-filled when casting is published; outside credits can be added.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No shows yet — the first one is always the most magical.
            </p>
          ) : (
            <ol className="relative flex flex-col gap-3 border-l pl-4">
              {history.map((entry) => (
                <li key={entry.id}>
                  <p className="font-medium">
                    {entry.role} — {entry.productionTitle}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {entry.year}
                    {entry.organization ? ` · ${entry.organization}` : ""}
                    {entry.director ? ` · dir. ${entry.director}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {hopes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Hopes for this season</CardTitle>
            <CardDescription>
              Private to your family and NOVA PA staff — never visible to other
              families.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0">
            {hopes.map((entry) => (
              <blockquote key={entry.id} className="border-l-2 border-primary/40 pl-3">
                <p className="text-sm">{entry.text}</p>
                <footer className="mt-1 text-xs text-muted-foreground">
                  {entry.author === "parent" ? "Parent" : displayName}
                </footer>
              </blockquote>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 pt-0 text-sm">
          {student.school && (
            <>
              <dt className="text-muted-foreground">School</dt>
              <dd>{student.school}</dd>
            </>
          )}
          {student.tshirtSize && (
            <>
              <dt className="text-muted-foreground">T-shirt</dt>
              <dd>{student.tshirtSize}</dd>
            </>
          )}
          {student.vocalRange && (
            <>
              <dt className="text-muted-foreground">Vocal range</dt>
              <dd>{student.vocalRange}</dd>
            </>
          )}
          {student.allergies && (
            <>
              <dt className="text-muted-foreground">Allergies</dt>
              <dd>{student.allergies}</dd>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
