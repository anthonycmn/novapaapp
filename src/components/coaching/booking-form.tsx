"use client";

import { useActionState, useState } from "react";
import { CalendarPlus, Check, Ticket } from "lucide-react";
import { bookCoachingAction, type CoachingFormState } from "@/lib/actions/coaching";
import { formatSlot, offersByDay, type SlotOffer } from "@/lib/api/coaching/slots";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/forms/field-error";

const initialState: CoachingFormState = { ok: false };

export interface BookableStudent {
  id: string;
  name: string;
}

/** The punch card's three states, summed across the family's packages. */
export interface PunchCounts {
  purchased: number;
  completed: number;
  scheduled: number;
  remaining: number;
}

/**
 * The punch card. One circle per lesson bought: solid means it happened,
 * ringed means it is on the calendar, empty means it is still to schedule.
 * A parent reads their whole package standing in one glance, which is the
 * entire point of a punch card over a number.
 */
function PunchCard({ punch }: { punch: PunchCounts }) {
  const dots: ("done" | "booked" | "open")[] = [
    ...Array<"done">(Math.max(0, punch.completed)).fill("done"),
    ...Array<"booked">(Math.max(0, punch.scheduled)).fill("booked"),
    ...Array<"open">(Math.max(0, punch.remaining)).fill("open"),
  ];
  if (dots.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-secondary/50 p-3">
      <div className="flex flex-wrap gap-1.5" aria-hidden>
        {dots.map((state, i) => (
          <span
            key={i}
            className={
              state === "done"
                ? "size-4 rounded-full bg-primary"
                : state === "booked"
                  ? "size-4 rounded-full border-2 border-primary"
                  : "size-4 rounded-full border-2 border-muted-foreground/40"
            }
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {punch.completed} done · {punch.scheduled} on the calendar ·{" "}
        {punch.remaining} to schedule
      </p>
    </div>
  );
}

/** "acting" -> "Acting"; "musical theatre acting" -> "Musical theatre acting". */
function lessonLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Choosing an hour with a coach — and, for a package, keeping it.
 *
 * The order of the questions is the order a parent already has them in: who
 * is this for, what kind of lesson, when, and for how many weeks. The coach is
 * settled — they are reading that coach's page — so it is not asked again.
 *
 * THE WEEKLY SLOT IS THE DEFAULT FOR A PACKAGE. Tony, 11 Sep 2026: lessons on
 * a package run "on the same day at the same time consistently for at least 3
 * lessons in a row." So with three or more lessons to schedule, the form books
 * a standing weekly slot — the parent picks the first time and how many weeks
 * (three at minimum), and the portal books every occurrence or none of them.
 *
 * ONLY REAL TIMES ARE OFFERED for the first lesson. Later weeks are checked by
 * the database at submit, and a clash five weeks out refuses the whole series
 * with a sentence naming the week that failed.
 */
export function BookingForm({
  coachStaffId,
  coachName,
  sessionMinutes,
  students,
  slots,
  sessionsLeft,
  lessonTypes,
  initialType,
  initialStudentId,
  punch,
}: {
  coachStaffId: string;
  coachName: string;
  sessionMinutes: number;
  students: BookableStudent[];
  slots: SlotOffer[];
  sessionsLeft: number;
  /** The kinds of lesson this coach offers, from their roster row. */
  lessonTypes: string[];
  /** Preselected lesson type, e.g. carried through checkout's return URL. */
  initialType?: string;
  /** The child chosen on the coaches page, carried in from its URL. */
  initialStudentId?: string;
  punch: PunchCounts | null;
}) {
  const [state, formAction, pending] = useActionState<CoachingFormState, FormData>(
    bookCoachingAction,
    initialState
  );
  const [studentId, setStudentId] = useState(
    initialStudentId && students.some((s) => s.id === initialStudentId)
      ? initialStudentId
      : (students[0]?.id ?? "")
  );
  const [chosen, setChosen] = useState("");
  const [sessionType, setSessionType] = useState(
    initialType && lessonTypes.includes(initialType)
      ? initialType
      : (lessonTypes[0] ?? "")
  );

  // At least three in a row on a package; a one- or two-lesson balance books
  // what it has. The default is the whole balance: a punch card is for
  // filling in.
  const minWeeks = sessionsLeft >= 3 ? 3 : 1;
  const maxWeeks = Math.min(sessionsLeft, 12);
  const weekChoices: number[] = [];
  for (let n = minWeeks; n <= maxWeeks; n += 1) weekChoices.push(n);
  const [weeks, setWeeks] = useState(maxWeeks);

  const days = offersByDay(slots);

  if (students.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Add a performer to your family profile before booking coaching.
      </p>
    );
  }

  if (state.ok) {
    return (
      <p className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm font-medium">
        <Check className="size-4" />
        Booked. Your lessons are on your schedule, and we have told {coachName}.
      </p>
    );
  }

  if (sessionsLeft === 0) {
    // The punch card stays visible with nothing left to schedule — three
    // ringed punches IS the answer to "did my lessons book?", and hiding the
    // card at exactly that moment would un-answer it.
    return (
      <div className="flex flex-col items-stretch gap-3 rounded-lg border bg-card p-4">
        {punch && <PunchCard punch={punch} />}
        <p className="flex items-center gap-2 font-medium">
          <Ticket className="size-4" />
          {punch && punch.scheduled > 0
            ? "Every lesson on your card is scheduled"
            : "You have no lessons left to schedule"}
        </p>
        <p className="text-sm text-muted-foreground">
          {punch && punch.scheduled > 0
            ? "They are on your family schedule, and your coach has them too. Buy another package above when you are ready for more."
            : "Buy a package above and your punch card appears here, ready to book."}
        </p>
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        {coachName} has no open times just now. Message the office and we will
        find you one.
      </p>
    );
  }

  const effectiveWeeks = Math.max(minWeeks, Math.min(weeks, maxWeeks));

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <input type="hidden" name="coachStaffId" value={coachStaffId} />
      <input type="hidden" name="startsAt" value={chosen} />
      <input type="hidden" name="weeks" value={effectiveWeeks} />

      {punch && <PunchCard punch={punch} />}

      <p className="text-sm text-muted-foreground">
        Each lesson is {sessionMinutes} minutes, on the hour — the rest of the
        hour is turnaround time. A crossed-out hour is already taken.
        {sessionsLeft >= 3 &&
          " Lessons hold the same day and time each week, so pick the slot your week can keep."}
      </p>

      {students.length > 1 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Who is this for?</span>
          <select
            name="studentId"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            className="rounded-md border bg-background px-3 py-2"
          >
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {students.length === 1 && (
        <input type="hidden" name="studentId" value={students[0].id} />
      )}

      {lessonTypes.length > 1 ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">What kind of lesson?</span>
          <select
            name="sessionType"
            value={sessionType}
            onChange={(event) => setSessionType(event.target.value)}
            className="rounded-md border bg-background px-3 py-2"
          >
            {lessonTypes.map((type) => (
              <option key={type} value={type}>
                {lessonLabel(type)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="sessionType" value={sessionType} />
      )}

      {weekChoices.length > 1 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">How many weeks in a row?</span>
          <select
            value={effectiveWeeks}
            onChange={(event) => setWeeks(Number(event.target.value))}
            className="rounded-md border bg-background px-3 py-2"
          >
            {weekChoices.map((n) => (
              <option key={n} value={n}>
                {n} week{n === 1 ? "" : "s"}
                {n === sessionsLeft ? " — your whole punch card" : ""}
              </option>
            ))}
          </select>
          {sessionsLeft >= 3 && (
            <span className="text-xs text-muted-foreground">
              Packages book at least three lessons in a row, same day and time.
            </span>
          )}
        </label>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">
          {effectiveWeeks > 1 ? "Pick your weekly time" : "Pick a time"}
        </legend>
        {days.map((day) => (
          <div key={day.date} className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {day.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {day.offers.map(({ slot, taken }) => {
                const selected = slot === chosen;
                const time = formatSlot(slot).split(", ")[1];
                if (taken) {
                  // Taken hours stay visible with an ✕ — a grid with holes in
                  // it reads as "this coach barely works", not "booked up".
                  return (
                    <span
                      key={slot}
                      aria-label={`${time} — already taken`}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground/70 line-through"
                    >
                      <span aria-hidden>✕</span>
                      {time}
                    </span>
                  );
                }
                return (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setChosen(selected ? "" : slot)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      selected
                        ? "border-transparent bg-primary font-medium text-primary-foreground"
                        : "hover:bg-accent"
                    }`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Anything {coachName} should know?{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <textarea
          name="notes"
          rows={2}
          className="rounded-md border bg-background px-3 py-2"
          placeholder="Working on a college audition cut"
        />
      </label>

      <FieldError message={state.error} />
      {state.needsSessions && (
        <Link
          href="/messages/new"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Ask about coaching packages
        </Link>
      )}

      <Button type="submit" disabled={pending || !chosen} className="self-start">
        <CalendarPlus className="size-4" />
        {pending
          ? "Booking…"
          : !chosen
            ? "Pick a time above"
            : effectiveWeeks > 1
              ? `Book ${effectiveWeeks} weeks — ${formatSlot(chosen)}`
              : `Book ${formatSlot(chosen)}`}
      </Button>
    </form>
  );
}
