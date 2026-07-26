"use client";

import { useActionState } from "react";
import { answerQuestionAction } from "@/lib/actions/feed";
import type { FamilyFormState } from "@/lib/actions/family";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";

const initialState: FamilyFormState = { ok: false };

export function AnswerForm({ questionId }: { questionId: string }) {
  const boundAction = answerQuestionAction.bind(null, questionId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Textarea name="answer" placeholder="Write the answer…" className="min-h-16" />
      <FieldError message={state.errors?.answer} />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Answer privately"}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="publishAsFaq" className="size-4 accent-[var(--primary)]" />
          Also publish as public FAQ
        </label>
      </div>
    </form>
  );
}
