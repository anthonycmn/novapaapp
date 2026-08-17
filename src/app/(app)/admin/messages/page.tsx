import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, ShieldAlert } from "lucide-react";
import { getProvider } from "@/lib/api";
import { RECIPIENT_ROLES } from "@/lib/api/messages/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";

export const metadata = { title: "Family messages" };

/** Staff inbox — only threads addressed to a role this person covers. */
export default async function AdminMessagesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const inbox = await getProvider().getStaffInbox(user.id);
  const roleLabel = new Map(RECIPIENT_ROLES.map((role) => [role.value, role.label]));

  const open = inbox.filter((entry) => entry.thread.status === "open");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Family messages</h1>
        <p className="text-muted-foreground">
          {open.length} open · {inbox.length} total
        </p>
      </div>

      {inbox.length === 0 ? (
        <EmptyState
          icon={<Inbox aria-hidden className="size-8" />}
          title="Inbox zero"
          description="Messages addressed to you will appear here."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {inbox.map(({ thread, messages, familyName, studentName }) => {
            const last = messages[messages.length - 1];
            const awaitingReply = last?.authorSide === "family";
            return (
              <li key={thread.id}>
                <Link href={`/admin/messages/${thread.id}`}>
                  <Card
                    className={
                      awaitingReply && thread.status === "open"
                        ? "border-primary/40 transition-shadow hover:shadow-md"
                        : "transition-shadow hover:shadow-md"
                    }
                  >
                    <CardContent className="flex items-start justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{thread.subject}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {familyName}
                          {studentName && ` · ${studentName}`} ·{" "}
                          {formatEventTime(thread.lastMessageAt)}
                        </p>
                        <p className="mt-1 truncate text-sm">{last?.body}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {thread.recipientRole === "health_safety" && (
                          <Badge variant="destructive">
                            <ShieldAlert aria-hidden className="mr-1 size-3" />
                            Health &amp; Safety
                          </Badge>
                        )}
                        {thread.status === "closed" ? (
                          <Badge variant="secondary">Closed</Badge>
                        ) : (
                          awaitingReply && <Badge>Needs reply</Badge>
                        )}
                        {/* Whose it is, not merely who can see it. A shared
                            inbox where every line says "the office" leaves
                            everybody assuming somebody else has it. */}
                        <span className="text-right text-xs text-muted-foreground">
                          {thread.routeTopic && (
                            <span className="block">{thread.routeTopic}</span>
                          )}
                          {thread.recipientName ?? roleLabel.get(thread.recipientRole)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
