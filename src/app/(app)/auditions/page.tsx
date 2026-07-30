import Link from "next/link";
import { redirect } from "next/navigation";
import { Drama } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { AuditionForm } from "./audition-form";

export const metadata = { title: "Auditions" };

/**
 * Family audition hub: one form per registered student per production.
 * A 13+ student with their own login sees only themselves.
 */
export default async function AuditionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/admin/auditions/prod-frozen");

  const provider = getProvider();
  const [students, productions] = await Promise.all([
    provider.getStudentsForFamily(user.id, user.familyId),
    provider.getProductions(),
  ]);

  // A student account submits for themself only.
  const visibleStudents =
    user.role === "student"
      ? students.filter((student) => student.hasLogin)
      : students;

  // Which (student, production) pairs are registered — via enrollments.
  const rows: Array<{
    student: (typeof students)[number];
    production: (typeof productions)[number];
  }> = [];
  for (const student of visibleStudents) {
    const enrollments = await provider.getEnrollmentsForStudent(user.id, student.id);
    for (const enrollment of enrollments) {
      if (enrollment.status !== "enrolled" || !enrollment.productionId) continue;
      const production = productions.find((p) => p.id === enrollment.productionId);
      if (production) rows.push({ student, production });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Auditions</h1>
        <p className="text-muted-foreground">
          Tell the creative team about your performer before auditions.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Drama aria-hidden className="size-8" />}
          title="No productions to audition for"
          description="When you're registered for a show, the audition form appears here."
        />
      ) : (
        await Promise.all(
          rows.map(async ({ student, production }) => {
            const displayName = student.preferredName ?? student.firstName;
            const existing = await provider.getAuditionProfile(
              user.id,
              student.id,
              production.id
            );
            return (
              <Card key={`${student.id}-${production.id}`}>
                <CardHeader>
                  <CardTitle as="h2" className="text-base">
                    {displayName} — {production.title}
                  </CardTitle>
                  <CardDescription>
                    Headshot, resume, and audition song live in{" "}
                    <Link
                      href={`/family/students/${student.id}/materials`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      audition materials
                    </Link>
                    .
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AuditionForm
                    studentId={student.id}
                    productionId={production.id}
                    studentName={displayName}
                    existing={existing}
                  />
                </CardContent>
              </Card>
            );
          })
        )
      )}
    </div>
  );
}
