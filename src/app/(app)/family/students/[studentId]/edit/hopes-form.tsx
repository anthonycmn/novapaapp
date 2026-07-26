"use client";

import { useActionState } from "react";
import { saveHopesAction } from "@/lib/actions/student";
import type { FamilyFormState } from "@/lib/actions/family";
import type { HopesEntry } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";

const initialState: FamilyFormState = { ok: false };

/**
 * Hopes editor (#4): parent writes their hopes for the season; optionally a
 * student entry too. Entries are versioned per season server-side.
 */
export function HopesForm({
  studentId,
  seasonId,
  studentDisplayName,
  existing,
  isStudentSession,
}: {
  studentId: string;
  seasonId: string;
  studentDisplayName: string;
  existing: HopesEntry[];
  isStudentSession: boolean;
}) {
  const author = isStudentSession ? "student" : "parent";
  const latest = [...existing]
    .filter((entry) => entry.author === author && entry.seasonId === seasonId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const boundAction = saveHopesAction.bind(null, studentId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="seasonId" value={seasonId} />
      <input type="hidden" name="author" value={author} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hopes-text">
          {isStudentSession
            ? "Your casting hopes and goals this season"
            : `Your hopes for ${studentDisplayName} this season`}
        </Label>
        <Textarea
          id="hopes-text"
          name="text"
          defaultValue={latest?.text ?? ""}
          placeholder={
            isStudentSession
              ? "The part I'd love, and what I want to get better at…"
              : "What you're hoping this season holds for your child…"
          }
          maxLength={2000}
        />
        <FieldError message={state.errors?.text} />
        <p className="text-xs text-muted-foreground">
          Shared with NOVA PA directors before casting. Never visible to other
          families{isStudentSession ? "" : ", and not visible to your child unless you check the box below"}.
        </p>
      </div>

      {!isStudentSession && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="visibleToStudent"
            defaultChecked={latest?.visibleToStudent ?? false}
            className="size-4 accent-[var(--primary)]"
          />
          Let {studentDisplayName} read this
        </label>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save hopes"}
        </Button>
        {state.ok && (
          <p className="text-sm text-muted-foreground" role="status">
            Saved ✓
          </p>
        )}
      </div>
    </form>
  );
}
