import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDeniedError, getProvider } from "@/lib/api";
import { describeRecipient } from "@/lib/api/messages/topics";
import { RECIPIENT_ROLES } from "@/lib/api/messages/types";
import { getSessionUser } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MessageList, ReplyForm } from "@/components/messages/thread-view";

export const metadata = { title: "Message" };

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
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

  // Opening the thread marks the other side's messages read.
  await provider.markThreadRead(user.id, threadId);

  // The person we told them it was going to, as at the moment they sent it.
  // Older threads only ever knew a role, so they still say "the office".
  const sentTo =
    describeRecipient(view.thread) ||
    RECIPIENT_ROLES.find((role) => role.value === view.thread.recipientRole)?.label;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/messages"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          ← All messages
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{view.thread.subject}</h1>
          {view.thread.status === "closed" && <Badge variant="secondary">Closed</Badge>}
        </div>
        <p className="text-muted-foreground">
          To {sentTo}
          {view.thread.routeTopic && ` · ${view.thread.routeTopic}`}
          {view.studentName && ` · about ${view.studentName}`} ·{" "}
          {formatEventTime(view.thread.createdAt)}
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <MessageList messages={view.messages} viewerSide="family" />
        </CardContent>
      </Card>

      <ReplyForm threadId={threadId} />
    </div>
  );
}
