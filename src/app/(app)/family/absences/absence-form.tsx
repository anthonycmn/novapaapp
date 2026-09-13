"use client";

import { useActionState, useState } from "react";
import { reportAbsenceAction } from "@/lib/actions/absence";
import type { SubmissionState } from "@/lib/actions/spirit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";

const initialState: SubmissionState = { ok: false };

export interface AbsenceOption {
  studentId: string;
  studentName: string;
  /** A show or a class (0084) — the form posts the matching id. */
  offeringKind: "production" | "class";
  offeringId: string;
  offeringTitle: string;
}

const keyOf = (o: AbsenceOption) => `${o.studentId}|${o.offeringKind}:${o.offeringId}`;

/**
 * Telling us a child will miss part of a show.
 *
 * One control does the child-and-show pair, because that is the fact being
 * reported. Two separate dropdowns would let a parent pick a child and a show
 * that have nothing to do with each other, and the server would have to refuse
 * it after they had filled in the rest of the form.
 *
 * One date and two times, not two dates (Tony, 23 Aug 2026: "Date Missed and
 * then start time and end time — for example, maybe they are arriving late").
 * Most of what a stage manager actually needs to know is partial: in at 8, out
 * at 7.30, gone for the middle hour. A first-day/last-day range could not say
 * any of that, and a parent missing two whole days files two reports — which
 * is also two rows the director can tick off separately.
 *
 * The times are optional and blank means the whole call, so the honest answer
 * to "we just won't be there" stays one click, and so the six reports filed
 * before this form changed still read correctly.
 */
export function AbsenceForm({ options }: { options: AbsenceOption[] }) {
  const [pair, setPair] = useState(options.length > 0 ? keyOf(options[0]) : "");
  const [missedOn, setMissedOn] = useState("");
  const [startsAtTime, setStartsAtTime] = useState("");
  const [state, formAction, pending] = useActionState(reportAbsenceAction, initialState);

  const picked = options.find((o) => keyOf(o) === pair);
  const studentId = picked?.studentId ?? "";
  const productionId = picked?.offeringKind === "production" ? picked.offeringId : "";
  const classId = picked?.offeringKind === "class" ? picked.offeringId : "";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="productionId" value={productionId} />
      <input type="hidden" name="classId" value={classId} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="absence-who">Who, and which show or class</Label>
        <select
          id="absence-who"
          value={pair}
          onChange={(event) => setPair(event.target.value)}
          className="min-h-11 rounded-md border bg-background px-3 text-sm"
        >
          {options.map((option) => (
            <option key={keyOf(option)} value={keyOf(option)}>
              {option.studentName} — {option.offeringTitle}
            </option>
          ))}
        </select>
        <FieldError message={state.errors?.studentId ?? state.errors?.productionId} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="missedOn">Date missed</Label>
        <Input
          id="missedOn"
          name="missedOn"
          type="date"
          value={missedOn}
          onChange={(event) => setMissedOn(event.target.value)}
          required
        />
        <FieldError message={state.errors?.missedOn} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startsAtTime">Start time</Label>
            <Input
              id="startsAtTime"
              name="startsAtTime"
              type="time"
              value={startsAtTime}
              onChange={(event) => setStartsAtTime(event.target.value)}
            />
            <FieldError message={state.errors?.startsAtTime} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endsAtTime">End time</Label>
            <Input
              id="endsAtTime"
              name="endsAtTime"
              type="time"
              min={startsAtTime || undefined}
            />
            <FieldError message={state.errors?.endsAtTime} />
          </div>
        </div>
        <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900 dark:border-amber-600/60 dark:bg-secondary dark:text-amber-100">
          <strong className="font-semibold">Only mark the times you will not be present.</strong>{" "}
          Arriving at 8.00 for a 7.00 call? That is 7.00 to 8.00. Leaving an
          hour early? Put the last hour. Missing the whole call or class, leave
          both blank.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">Why</Label>
        <Textarea
          id="reason"
          name="reason"
          rows={3}
          placeholder="Illness, a family commitment, a school event — a line is plenty."
          required
        />
        <FieldError message={state.errors?.reason} />
      </div>

      <FieldError message={state.errors?._form} />
      {state.ok && state.message && (
        <p role="status" className="text-sm font-medium text-primary">
          ✓ {state.message}
        </p>
      )}

      <Button type="submit" disabled={pending || options.length === 0} className="self-start">
        {pending ? "Sending…" : "Report this absence"}
      </Button>
    </form>
  );
}
