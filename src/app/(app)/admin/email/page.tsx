import Link from "next/link";
import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailComposer } from "./composer";

export const metadata = { title: "Email" };

/** Staff email center (#1): composer, templates, send history. */
export default async function EmailAdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const provider = getProvider();
  const [templates, productions, sends] = await Promise.all([
    provider.getEmailTemplates(user.id),
    provider.getProductions(),
    provider.getEmailSends(user.id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Email families</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compose</CardTitle>
          <CardDescription>
            Preview with a test to yourself before sending. Critical category
            bypasses family opt-outs — use it for safety and logistics only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailComposer templates={templates} productions={productions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-0">
          {sends.length === 0 ? (
            <p className="text-sm text-muted-foreground">No emails sent yet.</p>
          ) : (
            sends.map((send) => (
              <div
                key={send.id}
                className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/email/${send.id}`}
                    className="truncate font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {send.subject}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {send.sentAt
                      ? `Sent ${formatEventTime(send.sentAt)}`
                      : send.scheduledFor
                        ? `Scheduled ${formatEventTime(send.scheduledFor)}`
                        : "Draft"}{" "}
                    · {send.createdByName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">{send.category}</Badge>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {send.stats.delivered}/{send.stats.total} delivered
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
