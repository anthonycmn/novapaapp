import { redirect } from "next/navigation";
import { AlertTriangle, Bug } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { describeEnvironment } from "@/lib/bug-report/environment";
import { formatDate, formatTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { HandledButton } from "./handled-button";

export const metadata = { title: "Bug reports" };

/**
 * What families and staff have found broken.
 *
 * Every one of these was also emailed to CJ the moment it was sent — that is
 * the channel, and this is the record. The record is what shows four reports
 * of one bug in a week, which an inbox never does, and it is where a report
 * whose email failed can still be found.
 *
 * Open first, newest first, and nothing clever: a page nobody has to learn.
 */
export default async function BugReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const reports = await getProvider().getBugReports(user.id);
  const open = reports.filter((report) => report.status === "new");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Bug aria-hidden className="size-6" />
          Bug reports
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sent from the Spot panel, and emailed to cj@novapa.org as they arrive.
          {open.length > 0 && ` ${open.length} still open.`}
        </p>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nothing reported yet.
          </CardContent>
        </Card>
      ) : (
        reports.map((report) => (
          <Card key={report.id} className={report.status === "handled" ? "opacity-60" : undefined}>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {report.pagePath}
                </span>
                {report.status === "handled" ? (
                  <Badge>Handled</Badge>
                ) : (
                  <Badge className="bg-primary text-primary-foreground">Open</Badge>
                )}
                {/* The mail is the channel; a failed one has to be loud. */}
                {!report.emailed && (
                  <Badge className="bg-destructive text-destructive-foreground">
                    <AlertTriangle aria-hidden className="mr-1 inline size-3" />
                    Email did not send
                  </Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {report.reporterName} · {formatDate(report.createdAt)} at{" "}
                  {formatTime(report.createdAt)}
                </span>
              </div>

              <p className="whitespace-pre-wrap text-sm">{report.whatHappened}</p>
              {report.whatExpected && (
                <p className="whitespace-pre-wrap border-l-2 pl-3 text-sm text-muted-foreground">
                  Expected: {report.whatExpected}
                </p>
              )}

              <details className="rounded-md border bg-muted/40">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                  Browser and device
                </summary>
                <pre className="overflow-x-auto px-3 pb-3 text-[11px] leading-relaxed text-muted-foreground">
                  {describeEnvironment(report.environment)}
                </pre>
              </details>

              <div className="flex items-center gap-3">
                <HandledButton id={report.id} status={report.status} />
                <a
                  href={`mailto:${report.reporterEmail}?subject=${encodeURIComponent(
                    `Re: the problem you reported on ${report.pagePath}`
                  )}`}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Reply to {report.reporterEmail}
                </a>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
