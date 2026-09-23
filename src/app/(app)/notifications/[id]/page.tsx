import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Notification" };

/**
 * One notification, all of it.
 *
 * Jeanette Ward, 22 Sep 2026: "we can see the message preview, but can't read
 * the entire message." A notice that has no page of its own - above all the
 * "we emailed you this" copy of an office email - opens here, and shows the
 * whole email rather than the preview the list carries.
 */
export default async function NotificationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const found = await getProvider().getNotificationInFull(user.id, id);
  if (!found) notFound();
  const { notification, fullText } = found;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/notifications"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" /> All notifications
      </Link>
      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <h1 className="break-words text-xl font-semibold">{notification.title}</h1>
          <p className="text-xs text-muted-foreground">
            {formatEventTime(notification.createdAt)}
          </p>
          {/* Text, never HTML: pre-line keeps the paragraphs the office wrote. */}
          <div className="whitespace-pre-line break-words text-[15px] leading-relaxed">
            {fullText}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
