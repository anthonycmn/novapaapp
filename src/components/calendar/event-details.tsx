"use client";

import { useState } from "react";
import { ChevronDown, FileText, ListMusic, Users } from "lucide-react";
import type { CalendarEvent } from "@/lib/api/types";

/**
 * What is actually happening at this rehearsal, wherever a family meets it.
 *
 * CJ, 5 Sep 2026: "I keep having parents say that they can't see what is
 * happening at rehearsal — the details of the rehearsal within the portal."
 * The show page had this; the dashboard and the schedule page — the two
 * places a parent actually opens on a Tuesday — showed the time, the venue,
 * and nothing about the work. Same information, every surface, from here.
 *
 * Three layers, quietest last: who is called, what is being worked, and the
 * full plan off the show calendar behind a fold ("---" lines are the
 * dividers the calendar drew).
 */
export function EventNotes({
  event,
  compact = false,
}: {
  event: Pick<CalendarEvent, "calledNote" | "worksNote" | "details">;
  /** Tighter type for the dashboard's smaller rows. */
  compact?: boolean;
}) {
  const text = compact ? "text-[12px]" : "text-sm";
  return (
    <>
      {event.calledNote && (
        <p className={`flex items-start gap-1.5 ${text} leading-snug text-muted-foreground`}>
          <Users aria-hidden size={12} className="mt-0.5 shrink-0 text-gold" />
          <span>
            <span className="font-medium text-foreground">Called</span> {event.calledNote}
          </span>
        </p>
      )}
      {event.worksNote && (
        <p className={`flex items-start gap-1.5 ${text} leading-snug text-muted-foreground`}>
          <ListMusic aria-hidden size={12} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium text-foreground">Working</span> {event.worksNote}
          </span>
        </p>
      )}
    </>
  );
}

/** The director's full plan for the call, folded until a parent asks for it. */
export function EventDetails({
  details,
  compact = false,
}: {
  details: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const lines = details.split("\n");
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1 ${compact ? "text-[11.5px]" : "text-[12.5px]"} font-medium text-primary underline-offset-4 hover:underline`}
      >
        <FileText aria-hidden size={11} className="shrink-0" />
        {open ? "Hide the full plan" : "Full plan"}
        <ChevronDown
          aria-hidden
          size={11}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-1 rounded-md border bg-muted/40 px-2.5 py-2 text-[12px] leading-relaxed text-muted-foreground">
          {lines.map((line, index) =>
            line === "---" ? (
              <hr key={index} className="my-1.5 border-border" />
            ) : (
              <p key={index} className="whitespace-pre-wrap">
                {line}
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
