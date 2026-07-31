"use client";

import { useActionState, useState } from "react";
import { submitEvaluationAction } from "@/lib/actions/auditions";
import type { FamilyFormState } from "@/lib/actions/family";
import {
  DISCIPLINES,
  RUBRIC_CRITERIA,
  type AuditionEvaluation,
  type Discipline,
  type RubricCriterion,
} from "@/lib/api/auditions/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";

const initial: FamilyFormState = { ok: false };

/**
 * One rubric line: what the evaluator looks for, five scores, and the
 * objective descriptor for whichever score is selected — so the number is
 * anchored to observed behavior, not gut feel. All five descriptors are
 * one tap away for calibration.
 */
function CriterionRow({
  criterion,
  initialValue,
}: {
  criterion: RubricCriterion;
  initialValue?: number;
}) {
  const [value, setValue] = useState<number>(initialValue ?? 0);

  return (
    <fieldset className="rounded-lg border p-3">
      <legend className="px-1 text-sm font-semibold">{criterion.label}</legend>
      <p className="mb-2 text-sm text-muted-foreground">{criterion.looksFor}</p>

      <div className="flex gap-1" role="radiogroup" aria-label={`${criterion.label} score`}>
        {[5, 4, 3, 2, 1].map((score) => (
          <label key={score} className="cursor-pointer" aria-label={`${score} of 5`}>
            <input
              type="radio"
              name={`score_${criterion.key}`}
              value={score}
              checked={value === score}
              onChange={() => setValue(score)}
              required
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="inline-flex size-11 items-center justify-center rounded-lg border text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline peer-focus-visible:outline-2"
            >
              {score}
            </span>
          </label>
        ))}
      </div>

      {value > 0 && (
        <p className="mt-2 rounded-md bg-accent p-2 text-sm text-accent-foreground">
          <span className="font-semibold">{value} = </span>
          {criterion.levels[value as 5 | 4 | 3 | 2 | 1]}
        </p>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          What each score means
        </summary>
        <dl className="mt-1 flex flex-col gap-1 text-xs">
          {([5, 4, 3, 2, 1] as const).map((score) => (
            <div key={score} className="flex gap-2">
              <dt className="w-4 shrink-0 font-bold tabular-nums">{score}</dt>
              <dd className="text-muted-foreground">{criterion.levels[score]}</dd>
            </div>
          ))}
        </dl>
      </details>
    </fieldset>
  );
}

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
        Pick the descriptor that matches what you saw — the number follows.
        Subjectivity belongs in the notes.
        {existing && ` Last scored by ${existing.evaluatorName} — saving replaces it.`}
      </p>

      {/* key resets criterion state when the discipline changes */}
      <div key={discipline} className="flex flex-col gap-3">
        {criteria.map((criterion) => (
          <CriterionRow
            key={criterion.key}
            criterion={criterion}
            initialValue={existing?.scores[criterion.key]}
          />
        ))}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`notes-${studentId}-${discipline}`} className="text-sm font-medium">
            Notes{" "}
            <span className="font-normal text-muted-foreground">
              (your read on the performer — released to the family if they request feedback)
            </span>
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
            htmlFor={`growth-${studentId}-${discipline}`}
            className="text-sm font-medium"
          >
            How to keep growing{" "}
            <span className="font-normal text-muted-foreground">
              (optional — practice suggestions, classes or lessons; released with feedback)
            </span>
          </label>
          <Textarea
            id={`growth-${studentId}-${discipline}`}
            name="growthNotes"
            defaultValue={existing?.growthNotes ?? ""}
            placeholder="Ten minutes of daily breath work; our Vocal Technique class would build the support for sustained phrases."
            className="min-h-16"
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
