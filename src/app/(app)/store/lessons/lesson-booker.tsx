"use client";

import { useActionState, useState } from "react";
import { bookLessonAction } from "@/lib/actions/lessons";
import type { FamilyFormState } from "@/lib/actions/family";
import type { LessonSlot } from "@/lib/api/lessons/types";
import { LESSON_DISCIPLINES, WEEKDAY_NAMES } from "@/lib/api/lessons/types";
import { formatCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError } from "@/components/forms/field-error";
import { cn } from "@/lib/utils";

const initial: FamilyFormState = { ok: false };

export interface SlotRow {
  slot: LessonSlot;
  teacherName: string;
  teacherTitle: string;
  status: "open" | "taken" | "yours";
  studentName?: string;
}

/** "16:30" → "4:30 PM" for display. */
function formatSlotTime(startTime: string): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  const h12 = ((hours + 11) % 12) + 1;
  return `${h12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

/**
 * Weekly recurring slots grouped by teacher. Tap an open time, pick the
 * child, book — same time with the same teacher every week until you
 * cancel. Taken slots never say who holds them.
 */
export function LessonBooker({
  rows,
  students,
}: {
  rows: SlotRow[];
  students: Array<{ id: string; name: string }>;
}) {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [state, action, submitting] = useActionState(bookLessonAction, initial);

  const teachers = [...new Set(rows.map((row) => row.teacherName))];
  const disciplineMeta = (value: string) =>
    LESSON_DISCIPLINES.find((d) => d.value === value);
  const selected = rows.find((row) => row.slot.id === selectedSlotId);

  return (
    <div className="flex flex-col gap-3">
      {teachers.map((teacherName) => {
        const teacherRows = rows.filter((row) => row.teacherName === teacherName);
        const meta = disciplineMeta(teacherRows[0].slot.discipline);
        return (
          <Card key={teacherName}>
            <CardContent className="flex flex-col gap-3 p-4">
              <div>
                <p className="font-semibold">
                  <span aria-hidden className="mr-1.5">
                    {meta?.emoji}
                  </span>
                  {meta?.label} with {teacherName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {teacherRows[0].teacherTitle} ·{" "}
                  {formatCents(teacherRows[0].slot.pricePerLessonCents)} per{" "}
                  {teacherRows[0].slot.durationMin}-minute lesson ·{" "}
                  {teacherRows[0].slot.location}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {teacherRows.map(({ slot, status, studentName }) => (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={status === "taken" || submitting}
                    onClick={() =>
                      setSelectedSlotId((current) =>
                        current === slot.id ? null : slot.id
                      )
                    }
                    aria-pressed={selectedSlotId === slot.id}
                    className={cn(
                      "min-h-11 rounded-lg border px-3 text-sm font-medium",
                      status === "taken" &&
                        "cursor-not-allowed bg-muted text-muted-foreground",
                      status === "yours" && "border-primary bg-primary/10",
                      status === "open" &&
                        (selectedSlotId === slot.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-accent")
                    )}
                  >
                    {WEEKDAY_NAMES[slot.weekday]}s {formatSlotTime(slot.startTime)}
                    {status === "taken" && " · taken"}
                    {status === "yours" && ` · ${studentName?.split(" ")[0]}`}
                  </button>
                ))}
              </div>

              {selected && selected.teacherName === teacherName && (
                <form
                  action={action}
                  className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-accent/40 p-3"
                >
                  <input type="hidden" name="slotId" value={selected.slot.id} />
                  <p className="text-sm font-medium">
                    {WEEKDAY_NAMES[selected.slot.weekday]}s at{" "}
                    {formatSlotTime(selected.slot.startTime)} — every week with{" "}
                    {selected.teacherName}, until you cancel.
                  </p>

                  <label className="flex flex-col gap-1 text-sm font-medium">
                    Who&apos;s taking the lessons?
                    <select
                      name="studentId"
                      required
                      className="min-h-11 rounded-lg border bg-card px-3"
                      defaultValue={students.length === 1 ? students[0].id : ""}
                    >
                      <option value="" disabled>
                        Choose your child
                      </option>
                      {students.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-sm font-medium">
                    Anything to work toward? (optional)
                    <textarea
                      name="goals"
                      rows={2}
                      placeholder="Audition prep, belting, a specific song…"
                      className="rounded-lg border bg-card p-3 text-sm font-normal"
                    />
                  </label>

                  <p className="text-xs text-muted-foreground">
                    {formatCents(selected.slot.pricePerLessonCents)} per lesson,
                    billed by the studio. Online card payment is coming soon.
                  </p>

                  <FieldError message={state.errors?._form} />
                  <Button type="submit" disabled={submitting}>
                    {submitting
                      ? "Booking…"
                      : `Book ${WEEKDAY_NAMES[selected.slot.weekday]}s at ${formatSlotTime(selected.slot.startTime)}`}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
