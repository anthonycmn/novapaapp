"use client";

import { useActionState, useState } from "react";
import { submitReviewAction } from "@/lib/actions/reviews";
import type { FamilyFormState } from "@/lib/actions/family";
import { SCORE_PROMPTS } from "@/lib/api/reviews/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";
import { UnsavedChangesGuard } from "@/components/forms/unsaved-changes-guard";

const initialState: FamilyFormState = { ok: false };

/** Star rating, keyboard-operable as a radio group. */
function StarRating({ name, label, hint }: { name: string; label: string; hint: string }) {
  const [value, setValue] = useState(0);
  const describedBy = `${name}-hint`;

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <p id={describedBy} className="text-xs text-muted-foreground">
        {hint}
      </p>
      <div className="flex gap-1" role="radiogroup" aria-describedby={describedBy}>
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            className="cursor-pointer"
            aria-label={`${star} out of 5`}
          >
            <input
              type="radio"
              name={name}
              value={star}
              checked={value === star}
              onChange={() => setValue(star)}
              className="peer sr-only"
              required
            />
            <span
              aria-hidden
              className={`inline-flex size-11 items-center justify-center rounded-lg text-2xl transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${
                star <= value ? "text-gold" : "text-muted-foreground/40"
              }`}
            >
              ★
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ReviewForm({
  windowId,
  subjectName,
}: {
  windowId: string;
  subjectName: string;
}) {
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: FamilyFormState, formData: FormData) => {
      const result = await submitReviewAction(prev, formData);
      if (result.ok) setDirty(false);
      return result;
    },
    initialState
  );

  if (state.ok) {
    return (
      <p role="status" className="rounded-lg bg-accent p-4 text-sm text-accent-foreground">
        Thank you — your feedback about {subjectName} has been sent to the
        NOVA PA team. It stays private to staff and administrators.
      </p>
    );
  }

  return (
    <form action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-5">
      <UnsavedChangesGuard dirty={dirty} />
      <input type="hidden" name="windowId" value={windowId} />

      {SCORE_PROMPTS.map((prompt) => (
        <StarRating
          key={prompt.key}
          name={prompt.key}
          label={prompt.label}
          hint={prompt.hint}
        />
      ))}
      <FieldError message={state.errors?.instructionQuality} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="comment" className="text-sm font-medium">
          Anything else you&apos;d like us to know?
        </label>
        <Textarea
          id="comment"
          name="comment"
          className="min-h-32"
          maxLength={4000}
          placeholder="What went well, what could be better…"
        />
      </div>

      <label className="flex min-h-11 items-start gap-2 rounded-lg border p-3 text-sm">
        <input type="checkbox" name="isAnonymous" className="mt-0.5 size-4 accent-[var(--primary)]" />
        <span>
          Submit anonymously. Your name won&apos;t be shown to the staff
          member this is about.{" "}
          <span className="text-muted-foreground">
            Administrators can still see who wrote it, so they can follow up
            if something needs attention.
          </span>
        </span>
      </label>

      <FieldError message={state.errors?._form} />

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  );
}
