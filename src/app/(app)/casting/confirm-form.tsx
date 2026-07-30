"use client";

import { useActionState, useState } from "react";
import { respondToCastingAction } from "@/lib/actions/auditions";
import type { FamilyFormState } from "@/lib/actions/family";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/forms/field-error";

const initial: FamilyFormState = { ok: false };

export function ConfirmForm({
  confirmationId,
  studentName,
}: {
  confirmationId: string;
  studentName: string;
}) {
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);
  const bound = respondToCastingAction.bind(null, confirmationId);
  const [state, formAction, pending] = useActionState(bound, initial);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="response" value={choice ?? ""} />

      <p className="text-sm font-medium">
        Is &ldquo;{studentName}&rdquo; exactly how the name should appear in the
        playbill?
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          variant={choice === "yes" ? "default" : "outline"}
          onClick={() => setChoice("yes")}
        >
          Yes, that&apos;s correct
        </Button>
        <Button
          type="button"
          variant={choice === "no" ? "default" : "outline"}
          onClick={() => setChoice("no")}
        >
          No, it needs adjusting
        </Button>
      </div>

      {choice === "no" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`playbill-${confirmationId}`} className="text-sm font-medium">
            Exactly what should the playbill print?
          </label>
          <Input
            id={`playbill-${confirmationId}`}
            name="playbillName"
            placeholder={studentName}
            maxLength={80}
            required
          />
        </div>
      )}

      <FieldError message={state.errors?._form} />

      {choice && (
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Sending…" : "Confirm"}
        </Button>
      )}
    </form>
  );
}
