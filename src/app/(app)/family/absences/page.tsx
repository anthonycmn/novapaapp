import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { describeAbsenceWindow } from "@/lib/absence-window";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { CalendarOff } from "lucide-react";
import { AbsenceForm, type AbsenceOption } from "./absence-form";

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
  const [students, enrollments, productions, reports] = await Promise.all([
    provider.getStudentsForFamily(user.id, user.familyId),
    provider.getEnrollmentsForFamily(user.id, user.familyId),
    provider.getProductions(),
    provider.getAbsenceReportsForFamily(user.id, user.familyId),
  ]);

  const studentById = new Map(students.map((student) => [student.id, student]));
  const productionById = new Map(productions.map((production) => [production.id, production]));

  /* Every child-and-show pair this household is actually registered for. */
  const options: AbsenceOption[] = enrollments
    .filter((enrollment) => enrollment.status !== "withdrawn" && enrollment.productionId)
    .flatMap((enrollment) => {
      const student = studentById.get(enrollment.studentId);
      const production = productionById.get(enrollment.productionId!);
      if (!student || !production) return [];
      return [
        {
          studentId: student.id,
          studentName: student.preferredName ?? student.firstName,
          productionId: production.id,
          productionTitle: production.title,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.studentName.localeCompare(b.studentName) ||
        a.productionTitle.localeCompare(b.productionTitle)
    );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Report an absence</h1>
        <p className="text-muted-foreground">
          Tell us when your child will miss a rehearsal or a performance. It
          goes to the office and to the director of that show.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">What will they miss?</CardTitle>
          <CardDescription>
            {options.length > 0
              ? "Only mark the times your child will not be present — leave them blank to report the whole call."
              : "Nobody in this household is registered for a show at the moment."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {options.length > 0 ? (
            <AbsenceForm options={options} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Once a child is registered for a show, you can report an absence
              from it here.
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
