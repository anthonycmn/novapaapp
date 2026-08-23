"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Ticket } from "lucide-react";
import { cancelCoachingAction } from "@/lib/actions/coaching";
import type { CoachingSummary } from "@/lib/api/coaching/booking";
import { formatSlot } from "@/lib/api/coaching/slots";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * What this family has bought, and what they have coming.
 *
 * Shown above the coach list rather than on a page of its own, because the
 * two questions a returning parent has — "how many have I got left" and "when
 * is the next one" — are the reason they opened this section at all, and a
 * balance behind another click is a balance nobody checks.
 *
 * Cancelling asks first. It returns the session to the balance, so it is
 * recoverable, but a mis-tap that silently unbooks a Thursday is still a bad
 * afternoon.
 */
export function YourCoaching({ summary }: { summary: CoachingSummary }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (summary.packages.length === 0 && summary.upcoming.length === 0) {
    return null;
  }

  function cancel(sessionId: string) {
    setError(null);
    startTransition(async () => {
      const result = await cancelCoachingAction(sessionId);
      setConfirming(null);
      if (!result.ok) setError(result.error ?? "That could not be cancelled.");
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="flex items-center gap-2 font-medium">
          <Ticket className="size-4" />
          Your coaching
        </p>

        <p className="text-sm text-muted-foreground">
          {summary.sessionsLeft > 0
            ? `${summary.sessionsLeft} session${summary.sessionsLeft === 1 ? "" : "s"} left to book.`
            : "No sessions left in your package."}
        </p>

        {summary.upcoming.length > 0 && (
          <ul className="flex flex-col gap-2">
            {summary.upcoming.map((session) => (
              <li
                key={session.sessionId}
                className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
              >
                <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{formatSlot(session.startsAt)}</span>
                  <span className="text-muted-foreground">
                    {" — "}
                    {session.studentName}
                    {session.coachName ? ` with ${session.coachName}` : ""}
                  </span>
                </span>

                {confirming === session.sessionId ? (
                  <span className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pending}
                      onClick={() => cancel(session.sessionId)}
                    >
                      {pending ? "Cancelling…" : "Yes, cancel"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setConfirming(null)}
                    >
                      Keep it
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirming(session.sessionId)}
                  >
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
