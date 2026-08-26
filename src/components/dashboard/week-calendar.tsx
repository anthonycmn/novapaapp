"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import {
  buildWeek,
  dayNumber,
  todayKey,
  weekLabel,
  weekStart,
  weekdayLabel,
  weeksFromNow,
  addDays,
} from "@/lib/calendar/week";
import type { CallResponseRecord, FamilyCalendarEvent } from "@/lib/api/types";
import { CallResponse } from "@/components/dashboard/call-response";
import { formatTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Per-child colour, stable by the order children appear on the profile. */
const CHILD_COLORS = [
  "bg-chart-1",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-chart-2",
];

/**
 * The week this family actually has, built from what they are registered for.
 *
 * There is no configuration behind it and no second calendar to maintain: a
 * Sweeney Todd call, a Tuesday musical theatre class and a private lesson land
 * here because the child is enrolled in each, and a scene-tagged rehearsal
 * lands only on the calendar of a child whose role is called for it. Two
 * children in different shows produce one week with both, colour-coded, which
 * is the thing a parent is actually trying to work out on a Sunday night.
 *
 * Empty days are drawn rather than skipped. "Nothing on Wednesday" is the
 * answer to the question as often as a rehearsal is, and a list that silently
 * omits Wednesday cannot give it.
 */
export function WeekCalendar({
  events,
  students,
  responses = [],
  canRespond = false,
}: {
  events: FamilyCalendarEvent[];
  students: Array<{ id: string; name: string }>;
  /** This family's answers so far, keyed by event and child. */
  responses?: CallResponseRecord[];
  /** Staff see the same calendar and have nothing to answer. */
  canRespond?: boolean;
}) {
  const today = todayKey();
  const [anchor, setAnchor] = useState(() => weekStart(today));
  const [childFilter, setChildFilter] = useState<string | null>(null);

  const colorByStudent = useMemo(
    () =>
      Object.fromEntries(
        students.map((student, index) => [
          student.id,
          CHILD_COLORS[index % CHILD_COLORS.length],
        ])
      ),
    [students]
  );
  const nameByStudent = useMemo(
    () => Object.fromEntries(students.map((student) => [student.id, student.name])),
    [students]
  );

  const visible = childFilter
    ? events.filter((event) => event.studentIds.includes(childFilter))
    : events;
  const week = useMemo(() => buildWeek(visible, anchor, today), [visible, anchor, today]);
  const offset = weeksFromNow(anchor, today);
  const total = week.reduce((sum, day) => sum + day.events.length, 0);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">
          {offset === 0
            ? "This week"
            : offset === 1
              ? "Next week"
              : offset === -1
                ? "Last week"
                : weekLabel(anchor)}
        </h2>
        <span className="text-[12px] text-muted-foreground">{weekLabel(anchor)}</span>

        <div className="ml-auto flex items-center gap-1">
          {offset !== 0 && (
            <button
              type="button"
              onClick={() => setAnchor(weekStart(today))}
              className="rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Today
            </button>
          )}
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setAnchor((week) => addDays(week, -7))}
            className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
          >
            <ChevronLeft aria-hidden size={16} />
          </button>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setAnchor((week) => addDays(week, 7))}
            className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
          >
            <ChevronRight aria-hidden size={16} />
          </button>
        </div>
      </div>

      {/* One chip per child. With one child there is nothing to filter, so
          the row would be a control that does nothing. */}
      {students.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b px-4 py-2">
          <button
            type="button"
            onClick={() => setChildFilter(null)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[12px]",
              childFilter === null ? "border-primary bg-accent" : "hover:bg-muted"
            )}
          >
            Everyone
          </button>
          {students.map((student) => (
            <button
              key={student.id}
              type="button"
              onClick={() =>
                setChildFilter((current) => (current === student.id ? null : student.id))
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]",
                childFilter === student.id ? "border-primary bg-accent" : "hover:bg-muted"
              )}
            >
              <span
                aria-hidden
                className={cn("size-2 rounded-full", colorByStudent[student.id])}
              />
              {student.name}
            </button>
          ))}
        </div>
      )}

      {total === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
          {offset === 0
            ? "Nothing on this week — enjoy the quiet before the next show week."
            : "Nothing scheduled that week."}
        </p>
      ) : (
        <ul className="divide-y">
          {week.map((day) => (
            <li
              key={day.dayKey}
              className={cn(
                "flex gap-3 px-4 py-2.5",
                day.isToday && "bg-accent/40",
                day.events.length === 0 && "opacity-55"
              )}
            >
              <div className="w-10 shrink-0 text-center">
                <p
                  className={cn(
                    "text-[11px] uppercase tracking-wide",
                    day.isToday ? "font-semibold text-primary" : "text-muted-foreground"
                  )}
                >
                  {weekdayLabel(day.dayKey)}
                </p>
                <p
                  className={cn(
                    "text-[17px] leading-tight",
                    day.isToday ? "font-bold text-primary" : "font-medium"
                  )}
                >
                  {dayNumber(day.dayKey)}
                </p>
              </div>

              <div className="min-w-0 flex-1">
                {day.events.length === 0 ? (
                  <p className="py-1 text-[12px] text-muted-foreground">Nothing on</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {day.events.map((event) => (
                      <EventRow
                        key={`${event.id}-${event.studentIds.join(",")}`}
                        event={event}
                        colorByStudent={colorByStudent}
                        nameByStudent={nameByStudent}
                        showChildren={students.length > 1 && childFilter === null}
                        responses={responses}
                        canRespond={canRespond}
                      />
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventRow({
  event,
  colorByStudent,
  nameByStudent,
  responses,
  canRespond,
  showChildren,
}: {
  event: FamilyCalendarEvent;
  colorByStudent: Record<string, string>;
  nameByStudent: Record<string, string>;
  showChildren: boolean;
  responses: CallResponseRecord[];
  canRespond: boolean;
}) {
  const body = (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[13px] font-medium tabular-nums">
          {formatTime(event.startsAt)}
          <span className="text-muted-foreground">–{formatTime(event.endsAt)}</span>
        </span>
        <span className="text-[13px]">{event.title}</span>
        {event.changeNote && (
          <Badge variant="gold" className="shrink-0">
            Updated
          </Badge>
        )}
        {event.conflictsWith?.length ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-destructive">
            <AlertTriangle aria-hidden size={12} /> Clash
          </span>
        ) : null}
      </div>

      {/* The call time is a different fact to the start time, and the one
          that gets a family there on time. */}
      {event.callTime && event.callTime !== event.startsAt && (
        <p className="text-[12px] text-gold">Call {formatTime(event.callTime)}</p>
      )}

      {event.location && (
        <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
          <MapPin aria-hidden size={11} className="shrink-0" />
          <span className="truncate">{event.location}</span>
        </p>
      )}

      {event.calledNote && (
        <p className="text-[12px] text-muted-foreground">Called: {event.calledNote}</p>
      )}

      {showChildren && (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {event.studentIds.map((studentId) => (
            <span
              key={studentId}
              className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground"
            >
              <span
                aria-hidden
                className={cn("size-2 rounded-full", colorByStudent[studentId])}
              />
              {nameByStudent[studentId] ?? "Your child"}
            </span>
          ))}
        </p>
      )}

      {event.changeNote && <p className="text-[12px] text-gold">{event.changeNote}</p>}
    </>
  );

  // A show call links to the show, where the full run and the rehearsal
  // tracks live. Anything else has nowhere better to go than here.
  const answerFor = (studentId: string) => {
    const found = responses.find(
      (r) => r.eventId === event.id && r.studentId === studentId
    );
    return found ? { status: found.status, reason: found.reason } : null;
  };

  /*
   * The card links to the show; the answer buttons must not be inside that
   * link, or pressing "Conflict" navigates instead of answering. So the link
   * wraps the text and the controls sit under it.
   */
  return (
    <div>
      {event.productionId ? (
        <Link
          href={`/productions/${event.productionId}`}
          className="-mx-2 block rounded-md px-2 py-1 transition-colors hover:bg-muted"
        >
          {body}
        </Link>
      ) : (
        <div className="px-0 py-1">{body}</div>
      )}

      {canRespond &&
        event.studentIds.map((studentId) => (
          <CallResponse
            key={studentId}
            eventId={event.id}
            studentId={studentId}
            studentName={nameByStudent[studentId] ?? "Your child"}
            answer={answerFor(studentId)}
            showName={showChildren}
          />
        ))}
    </div>
  );
}
