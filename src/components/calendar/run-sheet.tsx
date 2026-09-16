import { ListMusic, MapPin, UserRound, Users } from "lucide-react";
import type { RunBlock } from "@/lib/api/types";

/**
 * The staff portal's "Run the day", as a family reads it.
 *
 * CJ, 16 Sep 2026: "I need them to have the same calendar, run pages, etc
 * . . . . and I want the staff page to be the authority." So this is the
 * same sheet a director is looking at — one row per room block, in the order
 * the day is run — with only the staff notes left off. The blocks arrive on
 * the event itself (CalendarEvent.run, written by the iCal sync from
 * staff_portal.curriculum_calls), so every surface that shows a call shows
 * the same thing: the show page, the dashboard, the schedule.
 *
 * A block a family's own child is in is marked with that child's name. The
 * match is on role ids resolved at sync time, not on names in the browser —
 * the staff page says "Toby", the cast list says "Tobias Ragg", and neither
 * has to change for the row to light up.
 */
export interface RunPerson {
  name: string;
  roleIds: string[];
}

/** "7:00" and "PM" from "19:00" — the clock a family reads, not the sheet's. */
function clock(hhmm: string): { time: string; meridiem: "AM" | "PM" } {
  const [h, m] = hhmm.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  return { time: `${h % 12 || 12}:${String(m).padStart(2, "0")}`, meridiem };
}

/** "9:00 – 10:30 AM", "11:00 AM – 12:30 PM", or just "7:00 PM". */
function span(start: string, end: string | null): string {
  const a = clock(start);
  if (!end) return `${a.time} ${a.meridiem}`;
  const b = clock(end);
  return a.meridiem === b.meridiem
    ? `${a.time} – ${b.time} ${b.meridiem}`
    : `${a.time} ${a.meridiem} – ${b.time} ${b.meridiem}`;
}

export function RunSheet({
  run,
  people = [],
  compact = false,
}: {
  run: RunBlock[];
  /** This family's performers in the show, to mark the blocks they are in. */
  people?: RunPerson[];
  /** Tighter type for the dashboard's smaller rows. */
  compact?: boolean;
}) {
  if (run.length === 0) return null;
  const text = compact ? "text-[12px]" : "text-[12.5px]";
  const sub = compact ? "text-[11.5px]" : "text-[12px]";

  return (
    <ol className={`mt-1 flex flex-col ${compact ? "gap-1" : "gap-1.5"}`}>
      {run.map((block, index) => {
        // Only a block that names a cast can name this child. A block that
        // resolved to nobody (lunch, "cast not set") is shown to everyone,
        // like the event itself, but marking every such block with the
        // child's name would make the mark mean nothing.
        const inBlock = block.roleIds
          ? people.filter((person) => person.roleIds.some((id) => block.roleIds!.includes(id)))
          : [];
        const mine = inBlock.length > 0;
        const when = block.start ? span(block.start, block.end) : null;
        return (
          <li
            key={block.id ?? index}
            className={`rounded-md border-l-2 pl-2 ${
              mine ? "border-gold bg-tip/40" : "border-border"
            }`}
          >
            {/* The staff page's row, field for field: the clock, the block's
                heading, then where and with whom. */}
            <p className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${text} leading-snug`}>
              {when && (
                <span className="font-medium tabular-nums text-foreground">{when}</span>
              )}
              {block.title && <span className="font-semibold text-foreground">{block.title}</span>}
              {block.room && (
                <span className={`inline-flex items-center gap-1 ${sub} text-muted-foreground`}>
                  <MapPin aria-hidden size={11} className="shrink-0" />
                  {block.room}
                </span>
              )}
              {block.leader && (
                <span className={`inline-flex items-center gap-1 ${sub} text-muted-foreground`}>
                  <UserRound aria-hidden size={11} className="shrink-0" />
                  {block.leader}
                </span>
              )}
              {mine && (
                <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                  {inBlock.map((person) => person.name).join(" · ")}
                </span>
              )}
            </p>
            {(block.pages || block.what) && (
              <p className={`${sub} leading-snug text-muted-foreground`}>
                {block.pages && <span className="font-medium text-foreground">{block.pages}</span>}
                {block.pages && block.what && " — "}
                {block.what}
              </p>
            )}
            {(block.called.length > 0 || block.calledLabel) && (
              <p className={`flex items-start gap-1.5 ${sub} leading-snug text-muted-foreground`}>
                <Users aria-hidden size={11} className="mt-0.5 shrink-0 text-gold" />
                <span>{block.calledLabel ?? block.called.join(" · ")}</span>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The heading a run sheet sits under, shared so every surface words it alike. */
export function RunSheetHeading({ compact = false }: { compact?: boolean }) {
  return (
    <p
      className={`flex items-center gap-1.5 ${compact ? "text-[11.5px]" : "text-[12px]"} font-medium text-foreground`}
    >
      <ListMusic aria-hidden size={12} className="shrink-0 text-muted-foreground" />
      The plan for this call
    </p>
  );
}
