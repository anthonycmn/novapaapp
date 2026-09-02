import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, Settings } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { markAllReadAction, markReadAction } from "@/lib/actions/notifications";
import { formatEventTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };

/**
 * In-app notification center (#2). Every push also lands here.
 *
 * Two piles, not one — 0056. CJ, 2 Sep 2026: "why am I seeing everyone's
 * notifications — I only want to see my notification, NOT everyone's." He is
 * a parent and the super admin on one account, and this page was handing him
 * both jobs at once: his own child's casting notice in among four other
 * families' playbill corrections, which are his to key in but are not news
 * about his child.
 *
 * So this page is the FAMILY pile. An account with a staff role gets a second
 * tab for the office pile — the same rows, still addressed to them, just not
 * mixed into the page a parent reads. An ordinary parent has never had an
 * office row and sees no tabs at all.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = getProvider();
  const isStaff = hasRoleAtLeast(user, "staff");
  const { view } = await searchParams;
  const audience = isStaff && view === "office" ? "staff" : "family";

  const [notifications, officeUnread] = await Promise.all([
    provider.getNotifications(user.id, audience),
    isStaff ? provider.getUnreadNotificationCount(user.id, "staff") : Promise.resolve(0),
  ]);
  const unread = notifications.filter((n) => !n.readAt);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <div className="flex items-center gap-2">
          {unread.length > 0 && (
            <form action={markAllReadAction.bind(null, audience)}>
              <Button variant="ghost" size="sm" type="submit">
                Mark all read
              </Button>
            </form>
          )}
          <Link
            href="/notifications/settings"
            aria-label="Notification settings"
            className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-accent"
          >
            <Settings aria-hidden className="size-5" />
          </Link>
        </div>
      </div>

      {isStaff && (
        <div className="flex gap-1 border-b">
          {(
            [
              { key: "family", href: "/notifications", label: "Mine" },
              {
                key: "staff",
                href: "/notifications?view=office",
                label: "Office",
                count: officeUnread,
              },
            ] as const
          ).map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium",
                audience === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {"count" in tab && tab.count > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                  {tab.count}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Bell aria-hidden className="size-8 text-muted-foreground" />
            <p className="font-medium">Nothing yet</p>
            <p className="text-sm text-muted-foreground">
              {audience === "staff"
                ? "Messages from families, playbill corrections and profile changes to review land here."
                : "Schedule changes, casting news, and photos of your child will show up here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <Card className={cn(!notification.readAt && "border-primary/40")}>
                <CardContent className="flex items-start gap-3 p-4">
                  {!notification.readAt && (
                    <span
                      aria-label="Unread"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                    />
                  )}
                  {/* The whole notification is a link to its destination —
                      a casting notice lands on /casting, a reply on the
                      thread — and following it marks it read. */}
                  <a
                    href={`/api/notifications/go/${notification.id}`}
                    className="min-w-0 flex-1 rounded-md hover:opacity-80"
                  >
                    <p className="font-medium">{notification.title}</p>
                    <p className="text-sm text-muted-foreground">{notification.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatEventTime(notification.createdAt)}
                      {notification.url && " · tap to open"}
                    </p>
                  </a>
                  {!notification.readAt && (
                    <form action={markReadAction.bind(null, notification.id)}>
                      <Button variant="ghost" size="sm" type="submit">
                        Read
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
