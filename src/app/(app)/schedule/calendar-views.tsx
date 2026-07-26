"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { FamilyCalendarEvent } from "@/lib/api/types";
import { formatEventTime, formatTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Per-child color coding (#5): stable palette by student index. */
const CHILD_COLORS = [
  "bg-chart-1",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-chart-2",
];

type View = "agenda" | "week" | "month";

export function CalendarViews({
  events,
  students,
}: {
  events: FamilyCalendarEvent[];
  students: Array<{ id: string; name: string }>;
}) {
  const [view, setView] = useState<View>("agenda");
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

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Calendar view" className="flex gap-1 rounded-lg bg-muted p-1">
        {(["agenda", "week", "month"] as View[]).map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={view === option}
            onClick={() => setView(option)}
            className={cn(
              "min-h-9 flex-1 rounded-md text-sm font-medium capitalize transition-colors",
              view === option ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {students.length > 1 && (
        <div className="flex flex-wrap gap-3">
          {students.map((student) => (
            <span key={student.id} className="inline-flex items-center gap-1.5 text-xs">
              <span
                aria-hidden
                className={cn("size-2.5 rounded-full", colorByStudent[student.id])}
              />
              {student.name}
            </span>
          ))}
        </div>
      )}

      {view === "agenda" && (
        <AgendaView events={events} colorByStudent={colorByStudent} />
      )}
      {view === "week" && <WeekView events={events} colorByStudent={colorByStudent} />}
      {view === "month" && <MonthView events={events} colorByStudent={colorByStudent} />}
    </div>
  );
}

function ChildDots({
  studentIds,
  colorByStudent,
}: {
  studentIds: string[];
  colorByStudent: Record<string, string>;
}) {
  return (
    <span className="inline-flex gap-1">
      {studentIds.map((id) => (
        <span
          key={id}
          aria-hidden
          className={cn("size-2.5 rounded-full", colorByStudent[id] ?? "bg-muted-foreground")}
        />
      ))}
    </span>
  );
}

function EventCard({
  event,
  colorByStudent,
}: {
  event: FamilyCalendarEvent;
  colorByStudent: Record<string, string>;
}) {
  return (
    <Card className={cn(event.conflictsWith?.length && "border-destructive/50")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ChildDots studentIds={event.studentIds} colorByStudent={colorByStudent} />
              <p className="font-medium">{event.title}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatEventTime(event.startsAt)} – {formatTime(event.endsAt)} · {event.location}
            </p>
            {event.callTime && (
              <p className="text-sm">
                <span className="font-medium">Call time:</span> {formatTime(event.callTime)}
              </p>
            )}
            {event.whatToBring && (
              <p className="text-sm">
                <span className="font-medium">Bring:</span> {event.whatToBring}
              </p>
            )}
            {event.contactName && (
              <p className="text-sm text-muted-foreground">
                Contact: {event.contactName}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant="secondary" className="capitalize">
              {event.type.replace("_", " ")}
            </Badge>
            {event.changeNote && <Badge variant="gold">Updated</Badge>}
          </div>
        </div>
        {event.changeNote && (
          <p className="mt-1 text-sm text-accent-foreground">{event.changeNote}</p>
        )}
        {event.conflictsWith && event.conflictsWith.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle aria-hidden className="size-4" />
            Overlaps with another child&apos;s event
          </p>
        )}
        {event.location && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(event.location)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Map
          </a>
        )}
      </CardContent>
    </Card>
  );
}

function AgendaView({
  events,
  colorByStudent,
}: {
  events: FamilyCalendarEvent[];
  colorByStudent: Record<string, string>;
}) {
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          Nothing scheduled. Enjoy the intermission!
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {events.map((event) => (
        <EventCard key={event.id} event={event} colorByStudent={colorByStudent} />
      ))}
    </div>
  );
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - result.getDay());
  result.setHours(0, 0, 0, 0);
  return result;
}

function WeekView({
  events,
  colorByStudent,
}: {
  events: FamilyCalendarEvent[];
  colorByStudent: Record<string, string>;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + index);
    return day;
  });

  return (
    <div className="flex flex-col gap-2">
      <WeekMonthNav
        label={`Week of ${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
        onPrev={() => setWeekStart((d) => new Date(d.getTime() - 7 * 86_400_000))}
        onNext={() => setWeekStart((d) => new Date(d.getTime() + 7 * 86_400_000))}
      />
      {days.map((day) => {
        const dayEvents = events.filter(
          (event) => new Date(event.startsAt).toDateString() === day.toDateString()
        );
        return (
          <div key={day.toISOString()}>
            <p className="mb-1 text-sm font-semibold">
              {day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </p>
            {dayEvents.length === 0 ? (
              <p className="pb-2 text-sm text-muted-foreground">—</p>
            ) : (
              <div className="flex flex-col gap-2 pb-2">
                {dayEvents.map((event) => (
                  <EventCard key={event.id} event={event} colorByStudent={colorByStudent} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  events,
  colorByStudent,
}: {
  events: FamilyCalendarEvent[];
  colorByStudent: Record<string, string>;
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const gridStart = startOfWeek(month);
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(day.getDate() + index);
    return day;
  });
  const [selected, setSelected] = useState<Date | null>(null);
  const selectedEvents = selected
    ? events.filter((event) => new Date(event.startsAt).toDateString() === selected.toDateString())
    : [];

  return (
    <div className="flex flex-col gap-3">
      <WeekMonthNav
        label={month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        onPrev={() => setMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
        onNext={() => setMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
      />
      <div role="grid" className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
        {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
          <div
            key={index}
            className="bg-muted p-1 text-center text-xs font-semibold text-muted-foreground"
          >
            {label}
          </div>
        ))}
        {cells.map((day) => {
          const dayEvents = events.filter(
            (event) => new Date(event.startsAt).toDateString() === day.toDateString()
          );
          const inMonth = day.getMonth() === month.getMonth();
          const isSelected = selected?.toDateString() === day.toDateString();
          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelected(day)}
              aria-label={`${day.toDateString()}, ${dayEvents.length} events`}
              className={cn(
                "flex min-h-12 flex-col items-center bg-card p-1 text-sm",
                !inMonth && "text-muted-foreground/50",
                isSelected && "outline outline-2 outline-primary -outline-offset-2"
              )}
            >
              {day.getDate()}
              <span className="mt-0.5 flex gap-0.5">
                {[...new Set(dayEvents.flatMap((event) => event.studentIds))]
                  .slice(0, 3)
                  .map((id) => (
                    <span
                      key={id}
                      aria-hidden
                      className={cn("size-1.5 rounded-full", colorByStudent[id])}
                    />
                  ))}
              </span>
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="flex flex-col gap-2">
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing on this day.</p>
          ) : (
            selectedEvents.map((event) => (
              <EventCard key={event.id} event={event} colorByStudent={colorByStudent} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function WeekMonthNav({
  label,
  onPrev,
  onNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <button
        onClick={onPrev}
        aria-label="Previous"
        className="inline-flex size-9 items-center justify-center rounded-lg border hover:bg-accent"
      >
        ‹
      </button>
      <p className="font-semibold">{label}</p>
      <button
        onClick={onNext}
        aria-label="Next"
        className="inline-flex size-9 items-center justify-center rounded-lg border hover:bg-accent"
      >
        ›
      </button>
    </div>
  );
}
