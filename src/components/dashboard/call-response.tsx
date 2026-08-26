"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { respondToCallAction } from "@/lib/actions/calls";
import { ConflictDialog } from "@/components/dashboard/conflict-dialog";
import { cn } from "@/lib/utils";

export interface CallAnswer {
  status: "attending" | "conflict";
  reason: string | null;
}

/**
 * "Are they coming?" — one call, one child, two buttons.
 *
 * From a parent, 25 Aug 2026: "it would be great if parents could mark
 * Attending or Conflict/Not Attending (with a reason) for each rehearsal day
 * directly from the dashboard. Having easy access to a record of submitted
 * attendance or conflicts would help parents confirm that everything was
 * communicated on time."
 *
 * THE ANSWER STAYS ON SCREEN, which is the second half of what she asked for.
 * The buttons do not vanish once pressed and there is no separate receipts
 * page to go and check: the calendar itself is the record, because the place
 * you would look to confirm you told somebody is the place you told them.
 *
 * A CONFLICT MUST SAY WHY. The reason box opens before anything is sent, and
 * an empty one is refused by the database as well as here. "Not attending"
 * with no reason is the message staff cannot act on and the one that becomes
 * a phone call — which is the thing this is meant to save.
 *
 * Optimistic, deliberately: the button shows the new answer immediately and
 * puts itself back if the write fails. A parent tapping this is standing in a
 * kitchen at seven in the morning, and a spinner they have to wait on is a
 * form they will finish later and then forget.
 */
export function CallResponse({
  eventId,
  studentId,
  studentName,
  answer,
  showName,
  eventTitle,
  eventWhen,
}: {
  eventId: string;
  studentId: string;
  studentName: string;
  answer: CallAnswer | null;
  /** Sibling calendars need the name; a single-child family does not. */
  showName: boolean;
  /** Shown in the dialog, so a parent can see what they are answering. */
  eventTitle: string;
  eventWhen: string;
}) {
  const [current, setCurrent] = useState<CallAnswer | null>(answer);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send(status: "attending" | "conflict", why?: string) {
    const previous = current;
    setCurrent({ status, reason: why ?? null });
    setError(null);
    setAsking(false);
    startTransition(async () => {
      const result = await respondToCallAction({
        eventId,
        studentId,
        status,
        reason: why,
      });
      if (!result.ok) {
        setCurrent(previous);
        setError(result.message ?? "That did not save.");
      }
    });
  }

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      {showName && (
        <span className="text-[11.5px] text-muted-foreground">{studentName}:</span>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => send("attending")}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] transition-colors",
          current?.status === "attending"
            ? "border-emerald-500 bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950"
            : "text-muted-foreground hover:border-emerald-400"
        )}
      >
        <Check aria-hidden size={11} /> Attending
      </button>

      <button
        type="button"
        disabled={pending}
        onClick={() => setAsking(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] transition-colors",
          current?.status === "conflict"
            ? "border-destructive bg-destructive/10 font-medium text-destructive"
            : "text-muted-foreground hover:border-destructive"
        )}
      >
        <X aria-hidden size={11} /> Conflict
      </button>

      {current?.status === "conflict" && current.reason && !asking && (
        <span className="text-[11.5px] italic text-muted-foreground">“{current.reason}”</span>
      )}

      {error && <span className="text-[11.5px] text-destructive">{error}</span>}

      {asking && (
        <ConflictDialog
          studentName={studentName}
          eventTitle={eventTitle}
          eventWhen={eventWhen}
          initialReason={current?.reason ?? null}
          onCancel={() => setAsking(false)}
          onSubmit={(why) => send("conflict", why)}
        />
      )}
    </span>
  );
}
