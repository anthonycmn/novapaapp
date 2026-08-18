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
  productionId: string;
  productionTitle: string;
}

/**
 * Telling us a child will miss part of a show.
 *
 * One control does the work: a child-and-show pair, because that is the fact
 * being reported. Two separate dropdowns would let a parent pick a child and a
 * show that have nothing to do with each other, and the server would have to
 * refuse it after they had filled in the rest of the form.
 *
 * A single date is the common case, so the end date starts equal to the start
 * date and follows it until the parent moves it themselves.
 */
export function AbsenceForm({ options }: { options: AbsenceOption[] }) {
  const [pair, setPair] = useState(
    options.length > 0 ? `${options[0].studentId}|${options[0].productionId}` : ""
  );
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [endTouched, setEndTouched] = useState(false);
  const [state, formAction, pending] = useActionState(reportAbsenceAction, initialState);

  const [studentId, productionId] = pair.split("|");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="studentId" value={studentId ?? ""} />
      <input type="hidden" name="productionId" value={productionId ?? ""} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="absence-who">Who, and which show</Label>
        <select
          id="absence-who"
          value={pair}
          onChange={(event) => setPair(event.target.value)}
          className="min-h-11 rounded-md border bg-background px-3 text-sm"
        >
          {options.map((option) => (
            <option
              key={`${option.studentId}|${option.productionId}`}
              value={`${option.studentId}|${option.productionId}`}
            >
              {option.studentName} — {option.productionTitle}
            </option>
          ))}
        </select>
        <FieldError message={state.errors?.studentId ?? state.errors?.productionId} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startsOn">First day missed</Label>
          <Input
            id="startsOn"
            name="startsOn"
            type="date"
            value={startsOn}
            onChange={(event) => {
              setStartsOn(event.target.value);
              if (!endTouched) setEndsOn(event.target.value);
            }}
            required
          />
          <FieldError message={state.errors?.startsOn} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endsOn">Last day missed</Label>
          <Input
            id="endsOn"
            name="endsOn"
            type="date"
            value={endsOn}
            min={startsOn || undefined}
            onChange={(event) => {
              setEndTouched(true);
              setEndsOn(event.target.value);
            }}
            required
          />
          <FieldError message={state.errors?.endsOn} />
        </div>
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
