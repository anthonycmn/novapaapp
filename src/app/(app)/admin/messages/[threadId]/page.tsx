import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { AccessDeniedError, getProvider } from "@/lib/api";
import { RECIPIENT_ROLES } from "@/lib/api/messages/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { setThreadStatusAction } from "@/lib/actions/messages";
import { formatEventTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MessageList, ReplyForm } from "@/components/messages/thread-view";

export const metadata = { title: "Message" };

export default async function AdminThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");
  const { threadId } = await params;

  const provider = getProvider();
  let view;
  try {
    view = await provider.getThread(user.id, threadId);
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
  if (!view) notFound();

  await provider.markThreadRead(user.id, threadId);

  const roleLabel = RECIPIENT_ROLES.find(
    (role) => role.value === view.thread.recipientRole
  )?.label;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/admin/messages"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          ← Inbox
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{view.thread.subject}</h1>
          {view.thread.recipientRole === "health_safety" && (
            <Badge variant="destructive">
              <ShieldAlert aria-hidden className="mr-1 size-3" />
              Health &amp; Safety
            </Badge>
          )}
          {view.thread.status === "closed" && <Badge variant="secondary">Closed</Badge>}
        </div>
        <p className="text-muted-foreground">
          {view.familyName}
          {view.studentName && ` · about ${view.studentName}`} · to {roleLabel} ·{" "}
          {formatEventTime(view.thread.createdAt)}
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <MessageList messages={view.messages} viewerSide="staff" />
        </CardContent>
      </Card>

      <ReplyForm threadId={threadId} />

      <form
        action={setThreadStatusAction.bind(
          null,
          threadId,
          view.thread.status === "open" ? "closed" : "open"
        )}
      >
        <Button type="submit" variant="outline">
          {view.thread.status === "open" ? "Mark resolved" : "Reopen"}
        </Button>
      </form>
    </div>
  );
}
