"use client";

import { useState, useTransition } from "react";
import { Bandage, Check, Clock, HelpCircle, X } from "lucide-react";
import { respondToCallAction } from "@/lib/actions/calls";
import {
  AttendanceDialog,
  type AttendanceStatus,
} from "@/components/dashboard/attendance-dialog";
import { cn } from "@/lib/utils";

export interface CallAnswer {
  status: AttendanceStatus;
  reason: string | null;
}

/**
 * The per-child attendance chip on a calendar card, and the box it opens.
 *
 * From a parent, 25 Aug 2026: "it would be great if parents could mark
 * Attending or Conflict/Not Attending (with a reason) for each rehearsal day
 * directly from the dashboard. Having easy access to a record of submitted
 * attendance or conflicts would help parents confirm that everything was
 * communicated on time." CJ then sent the screenshot it should look like.
 *
 * THE CHIP IS THE RECORD, which is the half of the request easy to miss. It
 * shows the child's name and the current answer — a tick, a cross, a plaster,
 * a clock, or a question mark when nobody has said. So the calendar itself
 * answers "did I tell them?", and there is no receipts page to go and find.
 * Straight from the screenshot, where every row carries the same chip.
 *
 * Optimistic: the chip changes at once and puts itself back if the write
 * fails. A parent doing this is standing in a kitchen at seven in the
 * morning, and a spinner is a form they finish later and then forget.
 */

const LOOK: Record<
  AttendanceStatus,
  { Icon: typeof Check; label: string; className: string }
> = {
  attending: {
    Icon: Check,
    label: "Attending",
    className: "border-emerald-500 text-emerald-700 dark:text-emerald-400",
  },
  not_attending: {
    Icon: X,
    label: "Not attending",
    className: "border-destructive text-destructive",
  },
  injury: {
    Icon: Bandage,
    label: "Injury",
    className: "border-sky-500 text-sky-700 dark:text-sky-400",
  },
  partial: {
    Icon: Clock,
    label: "Partial",
    className: "border-amber-500 text-amber-700 dark:text-amber-400",
  },
};

export function CallResponse({
  eventId,
  studentId,
  studentName,
  answer,
  eventTitle,
  eventWhen,
}: {
  eventId: string;
  studentId: string;
  studentName: string;
  answer: CallAnswer | null;
  eventTitle: string;
  eventWhen: string;
}) {
  const [current, setCurrent] = useState<CallAnswer | null>(answer);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(answer?.reason ?? "");
  const [showNote, setShowNote] = useState(Boolean(answer?.reason));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(status: AttendanceStatus | "clear") {
    const previous = current;
    setCurrent(status === "clear" ? null : { status, reason: note.trim() || null });
    setError(null);
    setOpen(false);
    startTransition(async () => {
      const result = await respondToCallAction({
        eventId,
        studentId,
        status,
        reason: note.trim() || undefined,
      });
      if (!result.ok) {
        setCurrent(previous);
        setError(result.message ?? "That did not save.");
      }
    });
  }

  const look = current ? LOOK[current.status] : null;

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen(true)}
        title={
          current
            ? `${studentName} — ${look?.label}${current.reason ? `: ${current.reason}` : ""}`
            : `Set attendance for ${studentName}`
        }
        className={cn(
          "mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] transition-colors",
          look ? look.className : "border-dashed text-muted-foreground hover:border-foreground"
        )}
      >
        {look ? (
          <look.Icon aria-hidden size={12} />
        ) : (
          <HelpCircle aria-hidden size={12} />
        )}
        {studentName}
      </button>

      {error && <span className="ml-1 text-[11.5px] text-destructive">{error}</span>}

      {open && (
        <AttendanceDialog
          studentName={studentName}
          eventTitle={eventTitle}
          eventWhen={eventWhen}
          current={current?.status ?? null}
          note={note}
          onNoteChange={setNote}
          showNote={showNote}
          onShowNote={() => setShowNote(true)}
          onPick={(status) => save(status)}
          onClear={() => save("clear")}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
