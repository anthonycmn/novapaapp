import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getRegistrationProvider } from "@/lib/api/registration";
import { registration as registrationConfig } from "@/config/registration";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { resyncRegistrationAction } from "@/lib/actions/registration";
import { formatEventTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Registration sync" };

const STATUS_META = {
  success: { icon: CheckCircle2, variant: "default" as const, label: "Success" },
  partial: { icon: AlertCircle, variant: "gold" as const, label: "Needs attention" },
  failed: { icon: XCircle, variant: "destructive" as const, label: "Failed" },
};

/**
 * Admin sync health view (#8). Phase requirement: "sync failures surface in
 * an admin health view rather than silently."
 */
export default async function RegistrationAdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const provider = getProvider();
  const registrationProvider = getRegistrationProvider();
  const [runs, links] = await Promise.all([
    provider.getSyncRuns(user.id),
    provider.getAccountLinks(user.id),
  ]);

  const lastRun = runs[0];
  const isMock = registrationProvider.source === "mock";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Registration sync</h1>
        <form action={resyncRegistrationAction}>
          <Button type="submit">
            <RefreshCw aria-hidden />
            Resync now
          </Button>
        </form>
      </div>

      {isMock && (
        <Card className="border-gold/50 bg-accent">
          <CardContent className="p-4 text-sm text-accent-foreground">
            <p className="font-medium">Running on mock registration data</p>
            <p>
              Set <code>REGISTRATION_API_URL</code> and{" "}
              <code>REGISTRATION_API_KEY</code> to connect the real portal. The
              adapter and field mapping live in{" "}
              <code>src/lib/api/registration/custom.ts</code>.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Connection</CardTitle>
          <CardDescription>{registrationProvider.displayName}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 pt-0 text-sm">
          <p>
            <span className="text-muted-foreground">Configured: </span>
            {registrationProvider.isConfigured() ? "Yes" : "No — using mock data"}
          </p>
          <p>
            <span className="text-muted-foreground">Last sync: </span>
            {lastRun ? formatEventTime(lastRun.startedAt) : "Never"}
          </p>
          <p>
            <span className="text-muted-foreground">Linked families: </span>
            {links.length}
          </p>
        </CardContent>
      </Card>

      {lastRun?.status === "failed" && (
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">
              Last sync failed
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm">
            <p className="font-mono text-xs">{lastRun.error}</p>
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-2 text-lg font-semibold">
          Sync history
        </h2>
        {runs.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No syncs yet. Hit &ldquo;Resync now&rdquo; to pull enrollments.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {runs.map((run) => {
              const meta = STATUS_META[run.status];
              const Icon = meta.icon;
              return (
                <Card key={run.id}>
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon aria-hidden className="size-4" />
                        <div>
                          <p className="text-sm font-medium">
                            {formatEventTime(run.startedAt)}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {run.trigger} · {run.source}
                          </p>
                        </div>
                      </div>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>

                    {run.status !== "failed" && (
                      <dl className="grid grid-cols-2 gap-x-4 text-xs sm:grid-cols-4">
                        <div>
                          <dt className="text-muted-foreground">Accounts</dt>
                          <dd className="tabular-nums">{run.counts.accountsSeen}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Enrollments</dt>
                          <dd className="tabular-nums">{run.counts.enrollmentsSeen}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Created</dt>
                          <dd className="tabular-nums">{run.counts.enrollmentsCreated}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Balances</dt>
                          <dd className="tabular-nums">{run.counts.balancesUpdated}</dd>
                        </div>
                      </dl>
                    )}

                    {run.issues.length > 0 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer font-medium">
                          {run.issues.length} item
                          {run.issues.length === 1 ? "" : "s"} need review
                        </summary>
                        <ul className="mt-2 flex flex-col gap-1.5">
                          {run.issues.map((issue, index) => (
                            <li key={index} className="text-muted-foreground">
                              <Badge variant="outline" className="mr-1.5">
                                {issue.kind.replace(/_/g, " ")}
                              </Badge>
                              {issue.message}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Where families register</CardTitle>
          <CardDescription>
            Deep-link destinations used across the app. Confirm these are still
            correct once the custom portal is live.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 pt-0 text-sm">
          <a
            href={registrationConfig.registrationLandingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            Registration landing page
          </a>
          <a
            href={registrationConfig.sawyer.schedulesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            Class & camp schedules
          </a>
          <a
            href={registrationConfig.regpack.coachingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            Coaching registration
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
