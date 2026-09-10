import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getProvider } from "@/lib/api";
import { emailDeliveryStatus } from "@/lib/api/email";
import { getPaymentProvider } from "@/lib/api/payments";
import { getRegistrationProvider } from "@/lib/api/registration";
import { getFaceMatchProvider } from "@/lib/api/photos/face-provider";
import { getSmugMugProvider } from "@/lib/api/photos/smugmug";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Staff tools" };

/**
 * Admin operations dashboard (Phase 7). One screen answering "is anything
 * waiting on me, and is anything broken?" — so staff don't have to visit
 * six pages to find out.
 */
export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const provider = getProvider();
  const isAdmin = hasRoleAtLeast(user, "admin");

  const [productions, openQuestions, pickupRequests, orders, syncRuns, healthStatus] =
    await Promise.all([
      provider.getProductions(),
      provider.getOpenQuestions(user.id),
      provider.getPickupRequestsForStaff(user.id),
      provider.getAllOrders(user.id),
      provider.getSyncRuns(user.id),
      provider.getHealthFormStatus(user.id, {}),
    ]);
  const flaggedReviews = isAdmin
    ? (await provider.getAllReviews(user.id)).filter((r) => r.flaggedAt && !r.resolvedAt)
    : [];

  const pendingPickups = pickupRequests.filter((r) => r.status === "pending").length;
  const newOrders = orders.filter((o) => o.status === "new").length;
  const missingForms = healthStatus.filter((row) => !row.form).length;
  /*
   * Best-effort: a provider that has not learned about bug reports must not
   * take the whole admin dashboard down with it.
   */
  const openBugs = (await provider.getBugReports(user.id).catch(() => [])).filter(
    (report) => report.status === "new"
  ).length;
  const lastSync = syncRuns[0];

  const queue = [
    { label: "Family questions", count: openQuestions.length, href: "/admin/questions" },
    { label: "Pick-up requests", count: pendingPickups, href: "/admin/pickup" },
    { label: "New button orders", count: newOrders, href: "/admin/store" },
    { label: "Missing health forms", count: missingForms, href: "/admin/health" },
    { label: "Open bug reports", count: openBugs, href: "/admin/bugs" },
    ...(isAdmin
      ? [{ label: "Flagged reviews", count: flaggedReviews.length, href: "/admin/reviews" }]
      : []),
  ];
  const totalWaiting = queue.reduce((sum, item) => sum + item.count, 0);

  /*
   * Email, checked properly rather than by the presence of a key.
   *
   * "Mock" in the list below was the only sign that no family had been emailed
   * since the receipt shipped, and a grey word in a list of five is not a sign
   * — Isabel Sok found it before we did, on 10 Sep 2026, by not receiving her
   * daughter's audition receipt. It gets a banner now.
   */
  const email = emailDeliveryStatus();

  // Which integrations are live vs running on mocks.
  const integrations = [
    { name: "Registration sync", ok: getRegistrationProvider().isConfigured(), href: "/admin/registration" },
    { name: "Email delivery", ok: email.ok },
    { name: "Payments", ok: getPaymentProvider().isConfigured() },
    { name: "SmugMug galleries", ok: getSmugMugProvider().isConfigured(), href: "/admin/photos" },
    { name: "Face matching", ok: getFaceMatchProvider().isConfigured(), href: "/admin/photos" },
  ];
  const mockCount = integrations.filter((integration) => !integration.ok).length;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Staff tools</h1>

      {!email.ok && (
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle aria-hidden className="size-5" />
              No email is reaching families
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm">
            <p>{email.reason}</p>
            <p className="mt-2 text-muted-foreground">
              Everything else works — audition receipts still show a confirmation code on
              screen, and every send is still recorded. Only the mail is missing.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className={totalWaiting > 0 ? "border-gold/50" : undefined}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {totalWaiting === 0 ? "Nothing waiting 🎉" : `${totalWaiting} waiting on you`}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 pt-0">
          {queue.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex min-h-11 items-center justify-between rounded-lg px-2 text-sm hover:bg-accent"
            >
              <span>{item.label}</span>
              {item.count > 0 ? (
                <Badge>{item.count}</Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { href: "/admin/email", title: "📧 Email families", description: "Templates, targeting, history" },
          { href: "/admin/questions", title: "💬 Question queue", description: "Answer private questions" },
          { href: "/admin/health", title: "🩺 Health & safety", description: "Completion + emergency roster" },
          { href: "/admin/pickup", title: "🚗 Drop-off & pick-up", description: "Approvals and today's roster" },
          { href: "/admin/registration", title: "🔄 Registration sync", description: "Sync health and resync" },
          { href: "/admin/store", title: "🎟️ Button orders", description: "Queue, manifest, print sheet" },
          { href: "/admin/photos", title: "📸 Photo ingestion", description: "Galleries and matching" },
          { href: "/admin/bugs", title: "🐛 Bug reports", description: "What families found broken" },
          ...(isAdmin
            ? [{ href: "/admin/reviews", title: "⭐ All feedback", description: "Reviews, trends, follow-up" }]
            : [{ href: "/staff/feedback", title: "⭐ My feedback", description: "What families said about your work" }]),
        ].map((tile) => (
          <Link key={tile.href} href={tile.href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">{tile.title}</CardTitle>
                <CardDescription>{tile.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">System status</CardTitle>
          <CardDescription>
            {mockCount === 0
              ? "All integrations connected."
              : `${mockCount} integration${mockCount === 1 ? "" : "s"} still running on mock data.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 pt-0 text-sm">
          {integrations.map((integration) => (
            <div
              key={integration.name}
              className="flex items-center justify-between gap-2 border-b py-1.5 last:border-b-0"
            >
              <span>{integration.name}</span>
              <span className="flex items-center gap-1.5">
                {integration.ok ? (
                  <>
                    <CheckCircle2 aria-hidden className="size-4 text-primary" />
                    <span className="text-muted-foreground">Connected</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle aria-hidden className="size-4 text-gold" />
                    <span className="text-muted-foreground">Mock</span>
                  </>
                )}
              </span>
            </div>
          ))}
          {lastSync && (
            <p className="pt-2 text-xs text-muted-foreground">
              Last registration sync: {formatEventTime(lastSync.startedAt)} ·{" "}
              {lastSync.status}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Pre-casting review card removed 26 Aug 2026: casting is run from the
          staff portal now, and this app keeps only the family half — the
          notification when a child is submitted, and the feedback request. */}
    </div>
  );
}
