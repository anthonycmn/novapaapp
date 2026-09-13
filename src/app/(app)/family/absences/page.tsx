import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { describeAbsenceWindow } from "@/lib/absence-window";
import { enrollmentIsCurrent } from "@/lib/enrollment-current";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { CalendarOff } from "lucide-react";
import { AbsenceForm, type AbsenceOption } from "./absence-form";
import { WithdrawButton } from "./withdraw-button";

export const metadata = { title: "Absences" };

/**
 * "My child will miss this."
 *
 * Tony, 18 Aug 2026: "Allow for parents to submit absences in their dashboard
 * for their shows, and then the director and the show director each receive
 * that information."
 *
 * The list underneath is the receipt. A parent who told us on Sunday that
 * their child would miss Tuesday needs to be able to see that they did — and
 * each row says who was actually emailed rather than implying the whole
 * building knows.
 */
export default async function AbsencesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/dashboard");

  const provider = getProvider();
  const [students, enrollments, productions, classes, reports] = await Promise.all([
    provider.getStudentsForFamily(user.id, user.familyId),
    provider.getEnrollmentsForFamily(user.id, user.familyId),
    provider.getProductions(),
    provider.getClasses(),
    provider.getAbsenceReportsForFamily(user.id, user.familyId),
  ]);

  const studentById = new Map(students.map((student) => [student.id, student]));
  const productionById = new Map(productions.map((production) => [production.id, production]));
  const classById = new Map(classes.map((klass) => [klass.id, klass]));

  /*
   * Every child-and-offering pair this household is actually registered for
   * — shows AND classes (0084). CJ, 13 Sep 2026: absences "across the entire
   * system". A Tuesday dance class is missed as often as a Saturday
   * rehearsal, and until this the form could not say so.
   */
  const options: AbsenceOption[] = enrollments
    .filter(
      (enrollment) =>
        enrollmentIsCurrent(enrollment) && (enrollment.productionId || enrollment.classId)
    )
    .flatMap((enrollment): AbsenceOption[] => {
      const student = studentById.get(enrollment.studentId);
      if (!student) return [];
      if (enrollment.productionId) {
        const production = productionById.get(enrollment.productionId);
        if (!production) return [];
        return [
          {
            studentId: student.id,
            studentName: student.preferredName ?? student.firstName,
            offeringKind: "production" as const,
            offeringId: production.id,
            offeringTitle: production.title,
          },
        ];
      }
      const klass = classById.get(enrollment.classId!);
      if (!klass) return [];
      return [
        {
          studentId: student.id,
          studentName: student.preferredName ?? student.firstName,
          offeringKind: "class" as const,
          offeringId: klass.id,
          offeringTitle: klass.name,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.studentName.localeCompare(b.studentName) ||
        a.offeringTitle.localeCompare(b.offeringTitle)
    );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Report an absence</h1>
        <p className="text-muted-foreground">
          Tell us when your child will miss a rehearsal, a performance or a
          class. It goes to the office and to the director of that show or the
          teacher of that class.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">What will they miss?</CardTitle>
          <CardDescription>
            {options.length > 0
              ? "Only mark the times your child will not be present — leave them blank to report the whole call."
              : "Nobody in this household is registered for a show or a class at the moment."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {options.length > 0 ? (
            <AbsenceForm options={options} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Once a child is registered for a show or a class, you can report
              an absence from it here.
            </p>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="absences-filed" className="flex flex-col gap-2">
        <h2 id="absences-filed" className="text-lg font-semibold">
          What you have told us
        </h2>
        {reports.length === 0 ? (
          <EmptyState
            icon={<CalendarOff aria-hidden className="size-8" />}
            title="Nothing reported"
            description="Absences you report will stay here as a record."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {reports.map((report) => {
              const student = studentById.get(report.studentId);
              const name = student
                ? (student.preferredName ?? student.firstName)
                : "Your student";
              return (
                <li key={report.id}>
                  <Card>
                    <CardContent className="p-4 text-sm">
                      <p className="font-medium">
                        {name} · {report.offeringTitle}
                      </p>
                      <p className="text-muted-foreground">
                        {describeAbsenceWindow(report)}
                      </p>
                      {report.reason && <p className="mt-1">{report.reason}</p>}
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        Reported {formatEventTime(report.createdAt)}
                        {report.notified.length > 0
                          ? ` · ${report.notified.length} ${
                              report.notified.length === 1 ? "person" : "people"
                            } notified`
                          : " · we could not reach anyone by email; please call the office"}
                      </p>
                      <WithdrawButton reportId={report.id} who={name} />
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
