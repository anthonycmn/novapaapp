import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, Settings } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { markAllReadAction, markReadAction } from "@/lib/actions/notifications";
import { formatEventTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };

/** In-app notification center (#2). Every push also lands here. */
export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const notifications = await getProvider().getNotifications(user.id);
  const unread = notifications.filter((n) => !n.readAt);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <div className="flex items-center gap-2">
          {unread.length > 0 && (
            <form action={markAllReadAction}>
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

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Bell aria-hidden className="size-8 text-muted-foreground" />
            <p className="font-medium">Nothing yet</p>
            <p className="text-sm text-muted-foreground">
              Schedule changes, casting news, and photos of your child will
              show up here.
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
