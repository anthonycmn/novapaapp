import { ExternalLink } from "lucide-react";
import { registration } from "@/config/registration";
import type { ClassOffering, Enrollment, Production, Student } from "@/lib/api/types";
import { formatCents } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Current enrollments on the family dashboard (#8), with deep links out to
 * the registration system for new signups and outstanding balances.
 */
export function EnrollmentsCard({
  enrollments,
  students,
  productions,
  classes,
}: {
  enrollments: Enrollment[];
  students: Student[];
  productions: Production[];
  classes: ClassOffering[];
}) {
  const active = enrollments.filter((e) => e.status !== "withdrawn");
  const studentsById = new Map(students.map((s) => [s.id, s]));
  const productionsById = new Map(productions.map((p) => [p.id, p]));
  const classesById = new Map(classes.map((c) => [c.id, c]));

  const totalBalance = active.reduce((sum, e) => sum + e.balanceCents, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Enrollments</CardTitle>
        <CardDescription>
          Synced from registration. Sign up for more any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active enrollments yet — browse classes and productions to get
            started.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((enrollment) => {
              const student = studentsById.get(enrollment.studentId);
              const production = enrollment.productionId
                ? productionsById.get(enrollment.productionId)
                : undefined;
              const offering = enrollment.classId
                ? classesById.get(enrollment.classId)
                : undefined;
              const title = production?.title ?? offering?.name ?? "Enrollment";

              return (
                <li
                  key={enrollment.id}
                  className="flex items-start justify-between gap-2 border-b pb-2 text-sm last:border-b-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{title}</p>
                    <p className="text-muted-foreground">
                      {student?.preferredName ?? student?.firstName}
                      {enrollment.status === "waitlisted" && " · waitlisted"}
                    </p>
                  </div>
                  {enrollment.balanceCents > 0 ? (
                    <Badge variant="gold" className="shrink-0">
                      {formatCents(enrollment.balanceCents)} due
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">
                      Paid
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          {totalBalance > 0 && (
            <a
              href={registration.sawyer.parentAccountUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Pay {formatCents(totalBalance)} balance
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
          )}
          <a
            href={registration.registrationLandingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-accent"
          >
            Register for a class
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
