import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import type { CalendarEvent } from "@/lib/api/types";
import { formatEventTime } from "@/lib/format";
import { org } from "@/config/org";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * The show's calendar, as a list, down the right-hand side — Tony,
 * 16 Aug 2026: "I want the calendar in list view on the right hand side so I
 * can see it quickly."
 *
 * List rather than a grid on purpose. A month grid answers "what does October
 * look like"; a parent on this page is asking "what is next, and where do I
 * drop them". That is a list, in date order, with the venue on every row —
 * this show moves from the rehearsal space to Loudoun Auditorium partway
 * through, and a family who assumes otherwise drives to the wrong building.
 *
 * Sticky on desktop so it stays put while the scene breakdown scrolls.
 */
export function ScheduleRail({
  events,
  productionTitle,
}: {
  events: CalendarEvent[];
  productionTitle: string;
}) {
  const now = new Date().toISOString();
  const upcoming = events
    .filter((event) => event.endsAt >= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = events.filter((event) => event.endsAt < now).length;

  return (
    <Card pad={false} className="lg:sticky lg:top-4">
      <SectionHeader
        title="Schedule"
        inCard
        right={
          <Link
            href="/schedule"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Full calendar <ArrowRight aria-hidden size={13} />
          </Link>
        }
      />

      {upcoming.length === 0 ? (
        <div className="p-4 text-[12.5px] leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">Nothing scheduled yet</p>
          <p className="mt-1">
            {past > 0
              ? `${past} past ${past === 1 ? "call" : "calls"} for this show. Nothing upcoming on your family's calendar.`
              : `Calls for ${productionTitle} appear here as soon as they are published.`}
          </p>
        </div>
      ) : (
        <ol className="max-h-[38rem] divide-y overflow-y-auto">
          {upcoming.map((event) => (
            <li key={event.id} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-[13px] font-medium leading-snug">
                  {event.title}
                </p>
                {event.changeNote && (
                  <span className="shrink-0 rounded-full bg-tip px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                    Updated
                  </span>
                )}
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
                <CalendarDays aria-hidden size={12} className="shrink-0" />
                {formatEventTime(event.startsAt)}
              </p>
              {event.location && (
                <p className="mt-0.5 flex items-start gap-1 text-[11.5px] leading-snug text-muted-foreground">
                  <MapPin aria-hidden size={12} className="mt-0.5 shrink-0" />
                  {event.location}
                </p>
              )}
              {event.callTime && (
                <p className="mt-0.5 text-[11.5px] text-gold">
                  Call {formatEventTime(event.callTime)}
                </p>
              )}
              {event.whatToBring && (
                <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                  Bring: {event.whatToBring}
                </p>
              )}
              {event.changeNote && (
                <p className="mt-0.5 text-[11.5px] leading-snug text-gold">
                  {event.changeNote}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="border-t px-4 py-2.5 text-[11.5px] text-muted-foreground">
        Times shown in {org.timeZone.split("/")[1].replace("_", " ")} time.
      </div>
    </Card>
  );
}
