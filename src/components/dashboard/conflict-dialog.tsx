"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Why can't they make it?" — the box that opens when a parent taps Conflict.
 *
 * CJ, 26 Aug 2026: "when I type conflict I want a window to open that allows
 * them to check boxes just like screen shot I sent you."
 *
 * THE SCREENSHOT NEVER REACHED ME — the parent's email mentions one and no
 * image came through, so this is the shape that team apps use rather than a
 * copy of hers: the common reasons as checkboxes, more than one allowed
 * because "school concert AND away that weekend" is a real answer, and a note
 * for the rest. If her version differs in a way that matters, the list lives
 * in REASONS below and is a one-line change.
 *
 * CHECKBOXES RATHER THAN A DROPDOWN. A dropdown hides the options until you
 * open it, which is the wrong trade for a list somebody reads once and picks
 * from in three seconds while standing in a kitchen. It also cannot express
 * two reasons at once, and the whole point of asking is to get something
 * staff can act on.
 *
 * WHAT STAFF SEE is the checked reasons and the note joined into one
 * sentence, because that is what the absence report carries and what the
 * morning digest emails. A parent who ticks nothing and writes nothing cannot
 * send: the reason is the difference between a message staff can act on and
 * one that becomes a phone call.
 */

const REASONS = [
  "School event or exam",
  "Another activity or sport",
  "Family commitment",
  "Illness",
  "Away / travelling",
  "Transport problem",
  "Work schedule",
];

export function ConflictDialog({
  studentName,
  eventTitle,
  eventWhen,
  initialReason,
  onCancel,
  onSubmit,
}: {
  studentName: string;
  eventTitle: string;
  eventWhen: string;
  initialReason?: string | null;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [checked, setChecked] = useState<string[]>(() =>
    REASONS.filter((r) => (initialReason ?? "").includes(r))
  );
  const [note, setNote] = useState(() => {
    // Whatever of the saved reason was not one of the boxes.
    let rest = initialReason ?? "";
    for (const r of REASONS) rest = rest.split(r).join("");
    return rest.replace(/^[\s,;·—-]+|[\s,;·—-]+$/g, "");
  });
  const panel = useRef<HTMLDivElement>(null);

  // Escape closes, and focus starts inside — this opens over a calendar a
  // parent is reading, and trapping them in it would be rude.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const reason = [checked.join(", "), note.trim()].filter(Boolean).join(" — ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Why ${studentName} cannot attend`}
        className="w-full max-w-md rounded-t-xl border bg-background p-4 shadow-lg outline-none sm:rounded-xl"
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{studentName} can&rsquo;t make it</h2>
            <p className="text-[13px] text-muted-foreground">
              {eventTitle} · {eventWhen}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X aria-hidden size={16} />
          </button>
        </div>

        <p className="mb-2 mt-2 text-[13px] text-muted-foreground">
          Tick anything that applies. Staff see this on the day.
        </p>

        <div className="flex flex-col">
          {REASONS.map((r) => {
            const on = checked.includes(r);
            return (
              <label
                key={r}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-2 text-[14px] hover:bg-muted"
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={on}
                  onChange={() =>
                    setChecked((c) => (on ? c.filter((x) => x !== r) : [...c, r]))
                  }
                />
                {r}
              </label>
            );
          })}
        </div>

        <label className="mt-2 block">
          <span className="text-[12.5px] font-medium text-muted-foreground">
            Anything else we should know
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Optional"
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-[14px]"
          />
        </label>

        <div className="mt-3 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={!reason} onClick={() => onSubmit(reason)}>
            Send
          </Button>
        </div>
        {!reason && (
          <p className="mt-1 text-right text-[12px] text-muted-foreground">
            Tick a reason, or write one.
          </p>
        )}
      </div>
    </div>
  );
}
