import { CalendarDays, Clock, MapPin, Package } from "lucide-react";
import type { CalendarEvent } from "@/lib/api/types";
import { formatEventTime } from "@/lib/format";

/**
 * The one thing a parent opens a show page to find out: where do I take my
 * child, and when.
 *
 * It gets the top of the page and the size to match, because everything else
 * here — the code, the songs, the contacts — is reference material a parent
 * reads once. This is the bit they check on a Tuesday evening in the car.
 *
 * Call time is separated from start time deliberately: on this show they are
 * ninety minutes apart on performance days, and a family that reads only the
 * curtain time arrives an hour and a half late for their child.
 */
export function NextCall({ event }: { event?: CalendarEvent }) {
  if (!event) {
    return (
      <div className="mb-4 rounded-lg border bg-card p-5 shadow-[var(--shadow-card)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          Next call
        </p>
        <p className="mt-1 text-[15px] font-medium">Nothing scheduled yet</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Calls appear here as soon as they are published.
        </p>
      </div>
    );
  }

  const startsIn = Math.round(
    (new Date(event.startsAt).getTime() - Date.now()) / 86_400_000
  );

  return (
    <div className="mb-4 overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
      {/* The gold band, 12% — the accent for the one thing on this page a
          parent came to read. Gold sits ON the wash rather than on the card,
          which is what stops it reading brown (see .gold-band). */}
      <div className="gold-band flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">
          Your next call
        </p>
        <p className="text-[12px] opacity-80">
          {startsIn <= 0 ? "today" : startsIn === 1 ? "tomorrow" : `in ${startsIn} days`}
        </p>
      </div>

      <div className="px-5 py-4">
        <h2 className="text-[19px] font-semibold leading-snug sm:text-[22px]">
          {event.title}
        </h2>

        <div className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <p className="flex items-start gap-2 text-[13.5px]">
            <CalendarDays aria-hidden size={15} className="mt-0.5 shrink-0 text-primary" />
            {formatEventTime(event.startsAt)}
          </p>
          {event.callTime && (
            <p className="flex items-start gap-2 text-[13.5px] font-medium text-primary">
              <Clock aria-hidden size={15} className="mt-0.5 shrink-0" />
              Be there by {formatEventTime(event.callTime)}
            </p>
          )}
          {event.location && (
            <p className="flex items-start gap-2 text-[13.5px] text-muted-foreground">
              <MapPin aria-hidden size={15} className="mt-0.5 shrink-0 text-primary" />
              {event.location}
            </p>
          )}
          {event.whatToBring && (
            <p className="flex items-start gap-2 text-[13.5px] text-muted-foreground">
              <Package aria-hidden size={15} className="mt-0.5 shrink-0 text-primary" />
              Bring: {event.whatToBring}
            </p>
          )}
        </div>

        {event.changeNote && (
          <p className="mt-2 rounded-md bg-tip px-3 py-1.5 text-[12.5px] text-tip-foreground">
            Changed — {event.changeNote}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The performance run as a single strip. Families plan around these dates and
 * send them to grandparents; a row of them beats hunting the schedule list.
 */
export function PerformanceStrip({ events }: { events: CalendarEvent[] }) {
  const shows = events
    .filter((e) => e.type === "performance")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (shows.length === 0) return null;

  const now = Date.now();
  return (
    <div className="mb-4 rounded-lg border bg-card p-4 shadow-[var(--shadow-card)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
        The run · {shows.length} performances
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {shows.map((show) => {
          const past = new Date(show.endsAt).getTime() < now;
          return (
            <div
              key={show.id}
              className={`rounded-md border px-3 py-1.5 text-[12.5px] ${
                past ? "opacity-50" : ""
              }`}
            >
              <span className="font-medium">{formatEventTime(show.startsAt)}</span>
              {show.callTime && (
                <span className="ml-2 text-muted-foreground">
                  call {formatEventTime(show.callTime).split("·")[1]?.trim()}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
