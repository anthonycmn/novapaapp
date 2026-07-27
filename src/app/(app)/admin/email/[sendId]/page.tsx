import { notFound, redirect } from "next/navigation";
import { MousePointerClick, MailOpen } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Email engagement" };

/** Per-send open and click tracking (#1). */
export default async function EmailEngagementPage({
  params,
}: {
  params: Promise<{ sendId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const { sendId } = await params;
  const provider = getProvider();

  const sends = await provider.getEmailSends(user.id);
  const send = sends.find((candidate) => candidate.id === sendId);
  if (!send) notFound();

  const { opens, clicks, nonOpeners } = await provider.getEmailEngagement(user.id, sendId);

  const openRate = send.stats.total > 0 ? (opens.length / send.stats.total) * 100 : 0;

  // Which links got clicked, most-clicked first.
  const byUrl = new Map<string, number>();
  for (const click of clicks) {
    byUrl.set(click.url, (byUrl.get(click.url) ?? 0) + 1);
  }
  const linkRanking = [...byUrl.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{send.subject}</h1>
        <p className="text-muted-foreground">
          {send.sentAt ? `Sent ${formatEventTime(send.sentAt)}` : "Not sent yet"} ·{" "}
          {send.createdByName}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Delivered" value={`${send.stats.delivered}/${send.stats.total}`} />
        <Stat
          label="Opened"
          value={`${opens.length} (${openRate.toFixed(0)}%)`}
          icon={<MailOpen aria-hidden className="size-4" />}
        />
        <Stat
          label="Clicks"
          value={String(clicks.length)}
          icon={<MousePointerClick aria-hidden className="size-4" />}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h2" className="text-base">
            Links clicked
          </CardTitle>
          <CardDescription>Which links families actually followed.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {linkRanking.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clicks recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {linkRanking.map(([url, count]) => (
                <li key={url} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{url}</span>
                  <Badge variant="secondary">{count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h2" className="text-base">
            Haven&apos;t opened it ({nonOpeners.length})
          </CardTitle>
          <CardDescription>
            Worth a nudge if this was time-sensitive. Note that some mail
            clients block the tracking pixel, so a few of these may have read
            it anyway.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {nonOpeners.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Everyone opened it — nice.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {nonOpeners.map((person) => (
                <li key={person.id} className="flex justify-between gap-2">
                  <span>{person.displayName}</span>
                  <span className="text-muted-foreground">{person.email}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {opens.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle as="h2" className="text-base">
              Opens
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="flex flex-col gap-1 text-sm">
              {opens.map((open) => (
                <li key={open.recipientId} className="flex justify-between gap-2">
                  <span>{open.recipientName}</span>
                  <span className="text-muted-foreground">
                    {formatEventTime(open.at)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {icon}
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
