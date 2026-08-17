"use client";

import { useActionState, useState } from "react";
import { createPickupRequestAction } from "@/lib/actions/pickup";
import type { FamilyFormState } from "@/lib/actions/family";
import type { Student } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";
import { UnsavedChangesGuard } from "@/components/forms/unsaved-changes-guard";

const initialState: FamilyFormState = { ok: false };
const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export function PickupRequestForm({ students }: { students: Student[] }) {
  const [dirty, setDirty] = useState(false);
  const [kind, setKind] = useState<"late_dropoff" | "early_pickup" | "both">("early_pickup");
  const [state, formAction, pending] = useActionState(
    async (prev: FamilyFormState, formData: FormData) => {
      const result = await createPickupRequestAction(prev, formData);
      if (result.ok) setDirty(false);
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-4">
      <UnsavedChangesGuard dirty={dirty} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="studentId">Student</Label>
        <select
          id="studentId"
          name="studentId"
          className="h-11 rounded-lg border border-input bg-card px-3 text-base"
          required
        >
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.preferredName ?? student.firstName} {student.lastName}
            </option>
          ))}
        </select>
        <FieldError message={state.errors?.studentId} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">What do you need?</legend>
        <div className="flex flex-wrap gap-4">
          {[
            { value: "late_dropoff", label: "Late drop-off" },
            { value: "early_pickup", label: "Early pickup" },
            { value: "both", label: "Both" },
          ].map((option) => (
            <label key={option.value} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="kind"
                value={option.value}
                checked={kind === option.value}
                onChange={() => setKind(option.value as typeof kind)}
                className="size-4 accent-[var(--primary)]"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startDate">From</Label>
          <Input id="startDate" name="startDate" type="date" required />
          <FieldError message={state.errors?.startDate} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endDate">Until</Label>
          <Input id="endDate" name="endDate" type="date" required />
          <FieldError message={state.errors?.endDate} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">
          Which days? <span className="text-muted-foreground">(leave blank for every day)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => (
            <label
              key={day.value}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm"
            >
              <input
                type="checkbox"
                name="recurringDays"
                value={day.value}
                className="size-4 accent-[var(--primary)]"
              />
              {day.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        {kind !== "early_pickup" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dropOffTime">Drop-off time</Label>
            <Input id="dropOffTime" name="dropOffTime" type="time" />
            <FieldError message={state.errors?.dropOffTime} />
          </div>
        )}
        {kind !== "late_dropoff" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pickUpTime">Pick-up time</Label>
            <Input id="pickUpTime" name="pickUpTime" type="time" />
            <FieldError message={state.errors?.pickUpTime} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">Reason</Label>
        <Textarea
          id="reason"
          name="reason"
          className="min-h-16"
          placeholder="Work schedule, sibling pickup, travel time…"
          required
        />
        <FieldError message={state.errors?.reason} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supervisingAdult">Supervising adult (if any)</Label>
          <Input id="supervisingAdult" name="supervisingAdult" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="authorizedPickupPerson">Who will pick up?</Label>
          <Input id="authorizedPickupPerson" name="authorizedPickupPerson" />
        </div>
      </div>

      <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        Extended care is $5 per day. You&apos;ll see the exact total once staff
        approves the request, and can pay from your dashboard.
      </p>

      <FieldError message={state.errors?._form} />
      {state.ok && (
        <p role="status" className="text-sm font-medium text-primary">
          ✓ Request submitted — we&apos;ll notify you when staff responds.
        </p>
      )}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Submitting…" : "Submit request"}
      </Button>
    </form>
  );
}
