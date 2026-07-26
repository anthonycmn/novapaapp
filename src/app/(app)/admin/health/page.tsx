import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Printer } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Health form status" };

/**
 * Admin completion dashboard + staff emergency roster (#9).
 * The roster is plain HTML so it prints cleanly and is cached offline by
 * the service worker for use in a theater with no signal.
 */
export default async function HealthAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ production?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const { production: productionId } = await searchParams;
  const provider = getProvider();
  const [productions, rows] = await Promise.all([
    provider.getProductions(),
    provider.getHealthFormStatus(user.id, productionId ? { productionId } : {}),
  ]);

  const incomplete = rows.filter((row) => !row.form);
  const withFlags = rows.filter(
    (row) => row.student.allergies || row.student.medicalFlags || row.form?.answers.allergies
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Health & safety</h1>
        <button
          type="button"
          className="hidden items-center gap-1.5 text-sm text-muted-foreground print:hidden sm:inline-flex"
        >
          <Printer aria-hidden className="size-4" />
          Print roster (Ctrl+P)
        </button>
      </div>

      <nav aria-label="Filter by production" className="flex flex-wrap gap-2 print:hidden">
        <Link
          href="/admin/health"
          className={`rounded-full border px-3 py-1.5 text-sm ${!productionId ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
        >
          All
        </Link>
        {productions.map((p) => (
          <Link
            key={p.id}
            href={`/admin/health?production=${p.id}`}
            className={`rounded-full border px-3 py-1.5 text-sm ${productionId === p.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            {p.title}
          </Link>
        ))}
      </nav>

      <Card className="print:hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Completion</CardTitle>
          <CardDescription>
            {rows.length - incomplete.length} of {rows.length} forms signed for
            this season.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-0">
          {incomplete.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Everyone is up to date. 🎉
            </p>
          ) : (
            <>
              {incomplete.map(({ student }) => (
                <div
                  key={student.id}
                  className="flex items-center justify-between gap-2 border-b py-2 text-sm last:border-b-0"
                >
                  <span>
                    {student.preferredName ?? student.firstName} {student.lastName}
                  </span>
                  <Badge variant="destructive">Missing</Badge>
                </div>
              ))}
              <form action="/admin/email" className="pt-2">
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Nudge {incomplete.length} incomplete famil
                  {incomplete.length === 1 ? "y" : "ies"}
                </button>
              </form>
            </>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="emergency-roster">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle aria-hidden className="size-5 text-destructive" />
          <h2 id="emergency-roster" className="text-lg font-semibold">
            Emergency roster
          </h2>
        </div>
        <p className="mb-3 text-sm text-muted-foreground print:hidden">
          Allergies and medical flags for everyone in this
          {productionId ? " production" : " season"}. Available offline.
        </p>

        {withFlags.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No allergies or medical flags on file for this group.
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th scope="col" className="p-2 text-left font-semibold">Student</th>
                  <th scope="col" className="p-2 text-left font-semibold">Allergies</th>
                  <th scope="col" className="p-2 text-left font-semibold">Medical</th>
                  <th scope="col" className="p-2 text-left font-semibold">Physician</th>
                </tr>
              </thead>
              <tbody>
                {withFlags.map(({ student, form }) => (
                  <tr key={student.id} className="border-t align-top">
                    <th scope="row" className="p-2 text-left font-medium">
                      {student.preferredName ?? student.firstName} {student.lastName}
                    </th>
                    <td className="p-2">
                      {form?.answers.allergies || student.allergies || "—"}
                    </td>
                    <td className="p-2">
                      {form?.answers.conditions || student.medicalFlags || "—"}
                      {form?.answers.medications ? ` · ${form.answers.medications}` : ""}
                    </td>
                    <td className="p-2">
                      {form
                        ? `${form.answers.physicianName} ${form.answers.physicianPhone}`
                        : "— (no form)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          Confidential — for NOVA PA staff use during rehearsals and
          performances only. Generated {formatDate(new Date().toISOString())}.
        </p>
      </section>
    </div>
  );
}
