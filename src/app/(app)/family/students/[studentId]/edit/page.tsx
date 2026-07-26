import { notFound, redirect } from "next/navigation";
import { AccessDeniedError, getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentForm } from "./student-form";
import { HopesForm } from "./hopes-form";

export const metadata = { title: "Edit student" };

export default async function EditStudentPage({
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

  const [season, hopes] = await Promise.all([
    provider.getCurrentSeason(),
    provider.getHopes(user.id, studentId),
  ]);

  const displayName = student.preferredName ?? student.firstName;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Edit {displayName}&apos;s profile</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basics</CardTitle>
        </CardHeader>
        <CardContent>
          <StudentForm student={student} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hopes for {season.name}</CardTitle>
          <CardDescription>
            Private to your family and NOVA PA staff. Directors read these
            before casting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HopesForm
            studentId={student.id}
            seasonId={season.id}
            studentDisplayName={displayName}
            existing={hopes}
            isStudentSession={user.role === "student"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
