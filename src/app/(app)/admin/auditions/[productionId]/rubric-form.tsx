"use client";

import { useActionState, useState } from "react";
import { submitEvaluationAction } from "@/lib/actions/auditions";
import type { FamilyFormState } from "@/lib/actions/family";
import {
  DISCIPLINES,
  RUBRIC_CRITERIA,
  type AuditionEvaluation,
  type Discipline,
} from "@/lib/api/auditions/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";

const initial: FamilyFormState = { ok: false };

/**
 * Rubric entry for one student. The evaluator picks their discipline lane —
 * director scores acting, vocal director scores singing, choreographer
 * scores dance — then scores each criterion 1–5.
 */
export function RubricForm({
  studentId,
  productionId,
  evaluations,
}: {
  studentId: string;
  productionId: string;
  evaluations: AuditionEvaluation[];
}) {
  const [discipline, setDiscipline] = useState<Discipline>("acting");
  const [state, formAction, pending] = useActionState(submitEvaluationAction, initial);

  const existing = evaluations.find((evaluation) => evaluation.discipline === discipline);
  const criteria = RUBRIC_CRITERIA[discipline];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="productionId" value={productionId} />
      <input type="hidden" name="discipline" value={discipline} />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Discipline">
        {DISCIPLINES.map((entry) => {
          const done = evaluations.some((e) => e.discipline === entry.value);
          return (
            <button
              key={entry.value}
              type="button"
              onClick={() => setDiscipline(entry.value)}
              aria-pressed={discipline === entry.value}
              className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${
                discipline === entry.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
            >
              {entry.label}
              {done && " ✓"}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Scored by the {DISCIPLINES.find((d) => d.value === discipline)?.evaluatorTitle}.
        {existing && ` Last scored by ${existing.evaluatorName} — saving replaces it.`}
      </p>

      {/* key resets the fieldset defaults when the discipline changes */}
      <div key={discipline} className="flex flex-col gap-3">
        {criteria.map((criterion) => (
          <fieldset key={criterion.key} className="flex flex-col gap-1">
            <legend className="text-sm font-medium">
              {criterion.label}
              <span className="ml-2 font-normal text-muted-foreground">
                {criterion.hint}
              </span>
            </legend>
            <div className="flex gap-1" role="radiogroup">
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value} className="cursor-pointer" aria-label={`${value} of 5`}>
                  <input
                    type="radio"
                    name={`score_${criterion.key}`}
                    value={value}
                    defaultChecked={existing?.scores[criterion.key] === value}
                    required
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className="inline-flex size-11 items-center justify-center rounded-lg border text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline peer-focus-visible:outline-2"
                  >
                    {value}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`notes-${studentId}-${discipline}`} className="text-sm font-medium">
            Notes <span className="font-normal text-muted-foreground">(released to the family if they request feedback)</span>
          </label>
          <Textarea
            id={`notes-${studentId}-${discipline}`}
            name="notes"
            defaultValue={existing?.notes ?? ""}
            className="min-h-20"
            maxLength={2000}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`callback-${studentId}-${discipline}`}
            className="text-sm font-medium"
          >
            Callback / role considerations{" "}
            <span className="font-normal text-muted-foreground">(staff only — never released)</span>
          </label>
          <Textarea
            id={`callback-${studentId}-${discipline}`}
            name="callbackNotes"
            defaultValue={existing?.callbackNotes ?? ""}
            placeholder="Consider for: Elsa, Middle Elsa. Strong belt, watch stamina."
            className="min-h-16"
            maxLength={2000}
          />
        </div>
      </div>

      <FieldError message={state.errors?._form} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : `Save ${DISCIPLINES.find((d) => d.value === discipline)?.label} rubric`}
        </Button>
        {state.ok && (
          <p role="status" className="text-sm text-muted-foreground">
            Saved ✓
          </p>
        )}
      </div>
    </form>
  );
}
