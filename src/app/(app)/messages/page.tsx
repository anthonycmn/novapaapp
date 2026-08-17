import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { getProvider } from "@/lib/api";
import { RECIPIENT_ROLES } from "@/lib/api/messages/types";
import { getSessionUser } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";

export const metadata = { title: "Messages" };

/** A family's message threads with the office. */
export default async function MessagesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/admin/messages");

  const threads = await getProvider().getMyThreads(user.id);
  const roleLabel = new Map(RECIPIENT_ROLES.map((role) => [role.value, role.label]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Messages</h1>
          <p className="text-muted-foreground">
            Private conversations with the NOVA PA office.
          </p>
        </div>
        <Link
          href="/messages/new"
          className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          New message
        </Link>
      </div>

      {threads.length === 0 ? (
        <EmptyState
          icon={<MessageSquare aria-hidden className="size-8" />}
          title="No messages yet"
          description="Need to tell us about an allergy, a schedule clash, or anything else? Start a conversation."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {threads.map((thread) => (
            <li key={thread.id}>
              <Link href={`/messages/${thread.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{thread.subject}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {/* The person, when we have one. Threads sent before
                            topics existed only ever knew a role, and saying
                            "the office" for those is honest; inventing a name
                            for them would not be. */}
                        {thread.recipientName ?? roleLabel.get(thread.recipientRole)} ·{" "}
                        {formatEventTime(thread.lastMessageAt)}
                      </p>
                    </div>
                    {thread.status === "closed" && (
                      <Badge variant="secondary" className="shrink-0">
                        Closed
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
