import Link from "next/link";
import {
  BadgeCheck,
  CalendarDays,
  Clock,
  ListMusic,
  MapPin,
  Package,
  Star,
  Users,
} from "lucide-react";
import type { CalendarEvent } from "@/lib/api/types";
import { formatEventTime } from "@/lib/format";
import { CallResponse, type CallAnswer } from "@/components/dashboard/call-response";
import type { RailStudent } from "@/components/productions/schedule-rail";

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
export function NextCall({
  event,
  productionId,
  students,
  calledStudentIds,
  answers,
}: {
  event?: CalendarEvent;
  /** Preselects the show in the store, so nobody picks it twice. */
  productionId?: string;
  /** This family's performers in the show; omitted for staff. */
  students?: RailStudent[];
  /** Which of them are called to THIS event. */
  calledStudentIds?: string[];
  /** `${eventId}:${studentId}` → the family's standing answer. */
  answers?: Record<string, CallAnswer>;
}) {
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
      {/* Yellow, and louder than the rest of the page on purpose: this is the
          one fact a parent opened the show page to find. */}
      <div className="gold-band-strong flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-2">
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
          {/* Only when it differs — see showableCallTime in lib/format. */}
          {event.callTime && event.callTime !== event.startsAt && (
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

        {/* Who is called and what the room works — from the show calendar,
            so this box and Google always say the same thing. */}
        {event.calledNote && (
          <p className="mt-2 flex items-start gap-2 text-[13px] text-muted-foreground">
            <Users aria-hidden size={15} className="mt-0.5 shrink-0 text-primary" />
            <span>
              <span className="font-medium text-foreground">Called</span> {event.calledNote}
            </span>
          </p>
        )}
        {event.worksNote && (
          <p className="mt-1 flex items-start gap-2 text-[13px] text-muted-foreground">
            <ListMusic aria-hidden size={15} className="mt-0.5 shrink-0 text-primary" />
            <span>
              <span className="font-medium text-foreground">Working</span> {event.worksNote}
            </span>
          </p>
        )}

        {/* The whole plan, in the director's own words, folded by default. */}
        {event.details && (
          <details className="mt-2 rounded-md border bg-muted/40 px-3 py-1.5">
            <summary className="cursor-pointer text-[12.5px] font-medium text-primary">
              Full plan for this call
            </summary>
            <div className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {event.details.split("\n").map((line, index) =>
                line === "---" ? (
                  <hr key={index} className="my-1.5 border-border" />
                ) : (
                  <p key={index} className="whitespace-pre-wrap">
                    {line}
                  </p>
                )
              )}
            </div>
          </details>
        )}

        {/* Each of this family's children on the call: their role, and the
            attendance chip — the record of what has been told to the show,
            editable in place. */}
        {(() => {
          const kids = (calledStudentIds ?? [])
            .map((id) => (students ?? []).find((student) => student.id === id))
            .filter((kid): kid is RailStudent => Boolean(kid));
          if (kids.length === 0) return null;
          return (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2.5">
              {kids.map((kid) => (
                <span key={kid.id} className="inline-flex items-baseline gap-1.5">
                  <CallResponse
                    eventId={event.id}
                    studentId={kid.id}
                    studentName={kid.name}
                    answer={answers?.[`${event.id}:${kid.id}`] ?? null}
                    eventTitle={event.title}
                    eventWhen={formatEventTime(event.startsAt)}
                  />
                  {kid.roleNames.length > 0 && (
                    <span className="text-[12px] text-muted-foreground">
                      as {kid.roleNames.join(" / ")}
                    </span>
                  )}
                </span>
              ))}
            </div>
          );
        })()}

        {event.changeNote && (
          <p className="mt-2 rounded-md bg-tip px-3 py-1.5 text-[12.5px] text-tip-foreground">
            Changed — {event.changeNote}
          </p>
        )}

        {/* Buttons and star pages, right where a family is already thinking
            about the show (Tony, 17 Aug 2026). Both are bought FOR a
            production, so the show page is where the thought occurs — the
            store is where you go once you have already had it. */}
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          <Link
            href={productionId ? `/store/buttons?show=${productionId}` : "/store/buttons"}
            className="gold-band gold-hover inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors"
          >
            <BadgeCheck aria-hidden size={14} />
            Spirit buttons
          </Link>
          <Link
            href={productionId ? `/store/star-pages?show=${productionId}` : "/store/star-pages"}
            className="gold-band gold-hover inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors"
          >
            <Star aria-hidden size={14} />
            Star pages
          </Link>
        </div>
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
              {/*
                  Both times, labeled — CJ, 26 Aug: "for the RUN in the parent
                  portal add both call time and performance time."

                  These were the same number until the 26th, because starts_at
                  held the CALL and the curtain lived only inside the title.
                  Now that they are two facts, a strip a family sends to
                  grandparents should carry the one they arrive for and the one
                  the curtain goes up on — and say which is which, because
                  "7:00" with no label is the thing that put somebody in a
                  car park at the wrong time.
              */}
              <span className="font-medium">{formatEventTime(show.startsAt).split("·")[0]?.trim()}</span>
              <span className="mt-0.5 flex flex-col text-[12px] leading-tight">
                {show.callTime && show.callTime !== show.startsAt && (
                  <span className="text-gold">
                    Call {formatEventTime(show.callTime).split("·")[1]?.trim()}
                  </span>
                )}
                <span className="text-muted-foreground">
                  Curtain {formatEventTime(show.startsAt).split("·")[1]?.trim()}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
