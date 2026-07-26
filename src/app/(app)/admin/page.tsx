import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getProvider } from "@/lib/api";
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
  const lastSync = syncRuns[0];

  const queue = [
    { label: "Family questions", count: openQuestions.length, href: "/admin/questions" },
    { label: "Pick-up requests", count: pendingPickups, href: "/admin/pickup" },
    { label: "New button orders", count: newOrders, href: "/admin/store" },
    { label: "Missing health forms", count: missingForms, href: "/admin/health" },
    ...(isAdmin
      ? [{ label: "Flagged reviews", count: flaggedReviews.length, href: "/admin/reviews" }]
      : []),
  ];
  const totalWaiting = queue.reduce((sum, item) => sum + item.count, 0);

  // Which integrations are live vs running on mocks.
  const integrations = [
    { name: "Registration sync", ok: getRegistrationProvider().isConfigured(), href: "/admin/registration" },
    { name: "Email delivery", ok: Boolean(process.env.RESEND_API_KEY) },
    { name: "Payments", ok: getPaymentProvider().isConfigured() },
    { name: "SmugMug galleries", ok: getSmugMugProvider().isConfigured(), href: "/admin/photos" },
    { name: "Face matching", ok: getFaceMatchProvider().isConfigured(), href: "/admin/photos" },
  ];
  const mockCount = integrations.filter((integration) => !integration.ok).length;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Staff tools</h1>

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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pre-casting review</CardTitle>
          <CardDescription>
            Read family hopes and audition materials before casting.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-0">
          {productions.map((production) => (
            <Link
              key={production.id}
              href={`/admin/casting-review/${production.id}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {production.title}
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
