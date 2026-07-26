"use client";

import { useActionState, useState } from "react";
import { askQuestionAction } from "@/lib/actions/feed";
import type { FamilyFormState } from "@/lib/actions/family";
import type { PostQuestion } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";

const initialState: FamilyFormState = { ok: false };

/**
 * Private Q&A under a post (#7): question threads are visible only to the
 * asker and staff unless staff publishes an answer as a public FAQ.
 */
export function QuestionBox({
  postId,
  questions,
  currentUserId,
  isStaff,
}: {
  postId: string;
  questions: PostQuestion[];
  currentUserId: string;
  isStaff: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = askQuestionAction.bind(null, postId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const faqs = questions.filter((q) => q.isPublicFaq && q.answer);
  const mine = questions.filter((q) => q.askerUserId === currentUserId && !q.isPublicFaq);

  return (
    <div className="flex flex-col gap-2">
      {faqs.length > 0 && (
        <div className="rounded-lg bg-muted p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Answered questions
          </p>
          {faqs.map((faq) => (
            <div key={faq.id} className="py-1 text-sm">
              <p className="font-medium">Q: {faq.question}</p>
              <p className="text-muted-foreground">A: {faq.answer}</p>
            </div>
          ))}
        </div>
      )}

      {mine.map((question) => (
        <div key={question.id} className="rounded-lg border border-dashed p-3 text-sm">
          <p className="font-medium">Your question: {question.question}</p>
          {question.answer ? (
            <p className="mt-1 text-muted-foreground">
              {question.answeredByName}: {question.answer}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Only you and NOVA PA staff can see this. We&apos;ll reply soon.
            </p>
          )}
        </div>
      ))}

      {!isStaff &&
        (open ? (
          <form action={formAction} className="flex flex-col gap-2">
            <Textarea
              name="question"
              placeholder="Ask the team a question — only staff will see it"
              className="min-h-16"
              maxLength={1000}
              autoFocus
            />
            <FieldError message={state.errors?.question} />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Sending…" : "Send question"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Ask a question
          </button>
        ))}
    </div>
  );
}
