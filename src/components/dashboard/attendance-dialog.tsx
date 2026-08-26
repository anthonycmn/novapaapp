"use client";

import { useEffect, useRef } from "react";
import { Bandage, Check, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AttendanceStatus = "attending" | "not_attending" | "injury" | "partial";

/**
 * "Set Attendance" — the box that opens on a call.
 *
 * Built from the screenshot CJ sent on 26 Aug 2026, of the app his son's
 * soccer team uses. Copied deliberately, because a parent who already answers
 * one of these every week should not have to learn a second shape: four
 * answers in a list, one at a time, a Clear that takes it back, and the note
 * folded away until somebody wants it.
 *
 * FOUR ANSWERS, NOT TWO. My first version had Attending and Conflict with a
 * compulsory reason box. The screenshot corrects both halves: Injury and
 * Partial are their own answers, and they tell a director more than a
 * sentence would — "Injury" is a rehearsal plan, "can't make it, sorry" is
 * not. And demanding prose from somebody tapping a phone at seven in the
 * morning is how a box ends up full of "n/a".
 *
 * SINGLE SELECT. A child is one of these things on one night. Checkboxes
 * would let somebody be attending and not attending at once, which is not an
 * answer, it is a bug report.
 */

const OPTIONS: Array<{
  value: AttendanceStatus;
  label: string;
  Icon: typeof Check;
  tone: string;
}> = [
  { value: "attending", label: "Attending", Icon: Check, tone: "text-emerald-600" },
  { value: "not_attending", label: "Not Attending", Icon: X, tone: "text-destructive" },
  { value: "injury", label: "Injury", Icon: Bandage, tone: "text-sky-600" },
  { value: "partial", label: "Partial", Icon: Clock, tone: "text-amber-600" },
];

export function AttendanceDialog({
  studentName,
  eventTitle,
  eventWhen,
  current,
  note,
  onNoteChange,
  showNote,
  onShowNote,
  onPick,
  onClear,
  onClose,
}: {
  studentName: string;
  eventTitle: string;
  eventWhen: string;
  current: AttendanceStatus | null;
  note: string;
  onNoteChange: (v: string) => void;
  showNote: boolean;
  onShowNote: () => void;
  onPick: (status: AttendanceStatus) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Escape closes, and focus starts inside. This opens over a calendar
  // somebody is reading; trapping them in it would be rude.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Set attendance for ${studentName}`}
        className="w-full max-w-sm rounded-t-xl border bg-background p-4 shadow-lg outline-none sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-[17px] font-semibold">Set Attendance</h2>
            <p className="text-[13px] text-muted-foreground">
              {eventTitle}: {eventWhen}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X aria-hidden size={18} />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="font-medium">{studentName}</span>
          {current && (
            <button
              type="button"
              onClick={onClear}
              className="text-[13px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        <div className="mt-2 overflow-hidden rounded-lg border">
          {OPTIONS.map(({ value, label, Icon, tone }) => (
            <button
              key={value}
              type="button"
              onClick={() => onPick(value)}
              aria-pressed={current === value}
              className={cn(
                "flex w-full items-center gap-3 border-b px-3 py-2.5 text-left text-[15px] last:border-b-0",
                current === value ? "bg-muted font-medium" : "hover:bg-muted/60"
              )}
            >
              <Icon aria-hidden size={17} className={tone} />
              {label}
            </button>
          ))}
        </div>

        {showNote ? (
          <label className="mt-3 block">
            <span className="text-[12.5px] font-medium text-muted-foreground">Note</span>
            <textarea
              autoFocus
              rows={2}
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Anything staff should know — optional"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-[14px]"
            />
          </label>
        ) : (
          <button
            type="button"
            onClick={onShowNote}
            className="mt-3 text-[13px] text-primary underline underline-offset-2"
          >
            Add note
          </button>
        )}
      </div>
    </div>
  );
}
