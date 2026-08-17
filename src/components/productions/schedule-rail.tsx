"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  Clock,
  ListMusic,
  MapPin,
  Package,
  UserRound,
} from "lucide-react";
import type { CalendarEvent, EventType } from "@/lib/api/types";
import { formatInTimeZone } from "date-fns-tz";
import { formatTime } from "@/lib/format";
import { org } from "@/config/org";
import { Card } from "@/components/ui/card";

/**
 * The show's calendar, as a list, down the right-hand side — Tony,
 * 16 Aug 2026: "I want the calendar in list view on the right hand side so I
 * can see it quickly."
 *
 * List rather than a grid on purpose. A month grid answers "what does October
 * look like"; a parent on this page is asking "what is next, and where do I
 * drop them". That is a list, in date order, with the venue on every row —
 * this show moves from the rehearsal space to the auditorium partway through,
 * and a family who assumes otherwise drives to the wrong building.
 *
 * It carries the WHOLE show now, not only the calls this family is in, with
 * their own calls marked. A rail that showed four rows out of thirty-seven
 * read as a broken calendar rather than a filtered one.
 */

type Filter = "mine" | "all" | "shows";

/**
 * What kind of call this is, in the words a family uses. "other" gets no
 * badge — a label that says "Other" tells nobody anything.
 */
const EVENT_TYPE_LABEL: Record<EventType, string | null> = {
  class: "Class",
  rehearsal: "Rehearsal",
  tech: "Tech",
  performance: "Performance",
  workshop: "Workshop",
  fitting: "Fitting",
  photo_call: "Photo call",
  other: null,
};

/** "2 hrs", "90 mins" — how long they are gone, without doing the sum. */
function durationOf(event: CalendarEvent): string {
  const minutes = Math.round(
    (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) / 60_000
  );
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  if (minutes < 60) return `· ${minutes} mins`;
  const hours = minutes / 60;
  const rounded = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `· ${rounded} ${hours === 1 ? "hr" : "hrs"}`;
}

export function ScheduleRail({
  events,
  myEventIds,
  sceneNames,
  productionTitle,
}: {
  events: CalendarEvent[];
  /** Event ids this family is actually called to, for the "My calls" view. */
  myEventIds?: string[];
  /** ShowScene id → name, so a scene-tagged call can say what it works. */
  sceneNames?: Record<string, string>;
  productionTitle: string;
}) {
  const mine = useMemo(() => new Set(myEventIds ?? []), [myEventIds]);
  // Default to the family's own calls when they have any — that is the
  // question they arrived with. Everyone else opens on the whole run.
  const [filter, setFilter] = useState<Filter>(mine.size > 0 ? "mine" : "all");
  const [showPast, setShowPast] = useState(false);

  const now = new Date().toISOString();

  const { rows, pastCount } = useMemo(() => {
    const byFilter = events.filter((event) => {
      if (filter === "mine") return mine.has(event.id);
      if (filter === "shows") return event.type === "performance";
      return true;
    });
    const past = byFilter.filter((event) => event.endsAt < now).length;
    const kept = byFilter
      .filter((event) => showPast || event.endsAt >= now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { rows: kept, pastCount: past };
  }, [events, filter, mine, now, showPast]);

  // Month headings, so a thirty-row list reads as "October" rather than as
  // thirty dates.
  const groups = useMemo(() => {
    const out: { month: string; events: CalendarEvent[] }[] = [];
    for (const event of rows) {
      const month = formatInTimeZone(new Date(event.startsAt), org.timeZone, "MMMM yyyy");
      const last = out[out.length - 1];
      if (last?.month === month) last.events.push(event);
      else out.push({ month, events: [event] });
    }
    return out;
  }, [rows]);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "mine" as const, label: "My calls", count: mine.size },
    { key: "all" as const, label: "Whole show", count: events.length },
    {
      key: "shows" as const,
      label: "Performances",
      count: events.filter((e) => e.type === "performance").length,
    },
  ].filter((tab) => tab.key !== "mine" || mine.size > 0);

  return (
    <Card pad={false} className="lg:sticky lg:top-4">
      <div className="border-b px-4 pb-2.5 pt-3">
        <h2 className="text-[15px] font-semibold">Schedule</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              aria-pressed={filter === tab.key}
              className={`rounded-full border px-2.5 py-1 text-[12.5px] transition-colors ${
                filter === tab.key
                  ? "border-gold bg-tip font-medium text-tip-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
              <span className="ml-1 tabular-nums opacity-70">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="p-4 text-[13px] leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">
            {pastCount > 0 ? "Nothing left on this list" : "Nothing scheduled yet"}
          </p>
          <p className="mt-1">
            {pastCount > 0
              ? `${pastCount} ${pastCount === 1 ? "date has" : "dates have"} already happened.`
              : `Calls for ${productionTitle} appear here as soon as they are published.`}
          </p>
        </div>
      ) : (
        <ol className="max-h-[42rem] overflow-y-auto">
          {groups.map((group) => (
            <li key={group.month}>
              <p className="sticky top-0 z-10 border-b bg-muted/95 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur">
                {group.month}
              </p>
              <ol className="divide-y">
                {group.events.map((event) => {
                  const isMine = mine.has(event.id);
                  const isPast = event.endsAt < now;
                  return (
                    <li
                      key={event.id}
                      className={`flex gap-3 px-4 py-2.5 ${isPast ? "opacity-55" : ""}`}
                    >
                      {/* A date block you can find with your thumb, rather
                          than a date buried in a sentence. */}
                      <div className="w-9 shrink-0 text-center">
                        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {formatInTimeZone(new Date(event.startsAt), org.timeZone, "EEE")}
                        </p>
                        <p className="text-[17px] font-semibold leading-none tabular-nums">
                          {formatInTimeZone(new Date(event.startsAt), org.timeZone, "d")}
                        </p>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 text-[13.5px] font-medium leading-snug">
                            {event.title}
                          </p>
                          <span className="flex shrink-0 items-center gap-1">
                            {EVENT_TYPE_LABEL[event.type] && (
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  event.type === "performance"
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {EVENT_TYPE_LABEL[event.type]}
                              </span>
                            )}
                            {event.changeNote && (
                              <span className="rounded-full bg-tip px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                                Updated
                              </span>
                            )}
                          </span>
                        </div>

                        {/* Start AND finish. A parent reading only the start
                            time knows when to drop off and not when to come
                            back, which is the question that actually gets
                            asked in the car park. */}
                        <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                          <CalendarDays aria-hidden size={12} className="shrink-0" />
                          <span className="font-medium text-foreground">
                            {formatTime(event.startsAt)} – {formatTime(event.endsAt)}
                          </span>
                          <span className="opacity-80">{durationOf(event)}</span>
                        </p>

                        {event.callTime && (
                          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] font-medium text-gold">
                            <Clock aria-hidden size={12} className="shrink-0" />
                            Be there by {formatTime(event.callTime)}
                          </p>
                        )}
                        {event.location && (
                          <p className="mt-0.5 flex items-start gap-1.5 text-[12px] leading-snug text-muted-foreground">
                            <MapPin aria-hidden size={12} className="mt-0.5 shrink-0" />
                            <span>
                              {event.location}
                              {event.mapUrl && (
                                <>
                                  {" "}
                                  <a
                                    href={event.mapUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium text-primary underline-offset-4 hover:underline"
                                  >
                                    Map
                                  </a>
                                </>
                              )}
                            </span>
                          </p>
                        )}
                        {event.whatToBring && (
                          <p className="mt-0.5 flex items-start gap-1.5 text-[12px] leading-snug text-muted-foreground">
                            <Package aria-hidden size={12} className="mt-0.5 shrink-0" />
                            <span>
                              <span className="font-medium text-foreground">Bring</span>{" "}
                              {event.whatToBring}
                            </span>
                          </p>
                        )}

                        {/* Which scenes and numbers this call actually works.
                            Untagged calls are the whole company, and saying so
                            is a detail too — it is the difference between
                            "we're not needed" and "everyone is". */}
                        {(() => {
                          const named = (event.sceneIds ?? [])
                            .map((id) => sceneNames?.[id])
                            .filter((name): name is string => Boolean(name));
                          if (named.length === 0) return null;
                          return (
                            <p className="mt-0.5 flex items-start gap-1.5 text-[12px] leading-snug text-muted-foreground">
                              <ListMusic aria-hidden size={12} className="mt-0.5 shrink-0" />
                              <span>
                                <span className="font-medium text-foreground">Working</span>{" "}
                                {named.join(" · ")}
                              </span>
                            </p>
                          );
                        })()}

                        {event.contactName && (
                          <p className="mt-0.5 flex items-start gap-1.5 text-[12px] leading-snug text-muted-foreground">
                            <UserRound aria-hidden size={12} className="mt-0.5 shrink-0" />
                            <span>
                              <span className="font-medium text-foreground">Ask</span>{" "}
                              {event.contactEmail ? (
                                <a
                                  href={`mailto:${event.contactEmail}`}
                                  className="text-primary underline-offset-4 hover:underline"
                                >
                                  {event.contactName}
                                </a>
                              ) : (
                                event.contactName
                              )}
                            </span>
                          </p>
                        )}

                        {event.changeNote && (
                          <p className="mt-1 rounded-md bg-tip px-2 py-1 text-[12px] leading-snug text-tip-foreground">
                            {event.changeNote}
                          </p>
                        )}
                        {isMine && filter !== "mine" && (
                          <p className="mt-0.5 text-[11.5px] font-medium text-gold">
                            Your child is called
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-[12px] text-muted-foreground">
        <span>Times in {org.timeZone.split("/")[1].replace("_", " ")} time.</span>
        {pastCount > 0 && (
          <button
            type="button"
            onClick={() => setShowPast((value) => !value)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {showPast ? "Hide" : "Show"} {pastCount} past
          </button>
        )}
      </div>
    </Card>
  );
}
