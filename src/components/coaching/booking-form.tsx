"use client";

import { useActionState, useState } from "react";
import { CalendarPlus, Check, Ticket } from "lucide-react";
import { bookCoachingAction, type CoachingFormState } from "@/lib/actions/coaching";
import { formatSlot, slotsByDay } from "@/lib/api/coaching/slots";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/forms/field-error";

const initialState: CoachingFormState = { ok: false };

export interface BookableStudent {
  id: string;
  name: string;
}

/**
 * Choosing an hour with a coach.
 *
 * The order of the questions is the order a parent already has them in: who
 * is this for, when, and anything you should know. The coach is settled — they
 * are reading that coach's page — so it is not asked again.
 *
 * ONLY REAL TIMES ARE OFFERED. The list comes from the coach's own hours with
 * everything already taken removed, so pressing a time is expected to work.
 * The database still has the last word, and when somebody else takes the slot
 * first the refusal says exactly that rather than "invalid input".
 */
export function BookingForm({
  coachStaffId,
  coachName,
  sessionMinutes,
  students,
  slots,
  sessionsLeft,
}: {
  coachStaffId: string;
  coachName: string;
  sessionMinutes: number;
  students: BookableStudent[];
  slots: string[];
  sessionsLeft: number;
}) {
  const [state, formAction, pending] = useActionState<CoachingFormState, FormData>(
    bookCoachingAction,
    initialState
  );
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [chosen, setChosen] = useState("");

  const days = slotsByDay(slots);

  if (students.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Add a performer to your family profile before booking coaching.
      </p>
    );
  }

  if (sessionsLeft === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border bg-card p-4">
        <p className="flex items-center gap-2 font-medium">
          <Ticket className="size-4" />
          You have no coaching sessions left
        </p>
        <p className="text-sm text-muted-foreground">
          Coaching is bought as a package of sessions. Message the office and we
          will get a package set up for you.
        </p>
        <Link
          href="/messages/new"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Ask about coaching packages
        </Link>
      </div>
    );
  }

  if (state.ok) {
    return (
      <p className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm font-medium">
        <Check className="size-4" />
        Booked. You will find it on your schedule, and we have told {coachName}.
      </p>
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

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <input type="hidden" name="coachStaffId" value={coachStaffId} />
      <input type="hidden" name="startsAt" value={chosen} />

      <p className="text-sm text-muted-foreground">
        {sessionsLeft} session{sessionsLeft === 1 ? "" : "s"} left in your
        package. Each booking is {sessionMinutes} minutes.
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

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Pick a time</legend>
        {days.map((day) => (
          <div key={day.date} className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {day.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {day.slots.map((slot) => {
                const selected = slot === chosen;
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
                    {formatSlot(slot).split(", ")[1]}
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
          : chosen
            ? `Book ${formatSlot(chosen)}`
            : "Pick a time above"}
      </Button>
    </form>
  );
}
