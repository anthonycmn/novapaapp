"use client";

import { useActionState, useState } from "react";
import { respondToCastingAction } from "@/lib/actions/auditions";
import type { FamilyFormState } from "@/lib/actions/family";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/forms/field-error";

const initial: FamilyFormState = { ok: false };

/**
 * Playbill confirmation. Whatever the family types is final — there is no
 * staff approval step (org policy). Because of that, the family can reopen
 * and change their answer any time before print; a typo they can't fix
 * themselves would otherwise go straight into the playbill.
 */
export function ConfirmForm({
  confirmationId,
  studentName,
  responded,
  currentPlaybillName,
}: {
  confirmationId: string;
  studentName: string;
  /** Has the family already answered? */
  responded: boolean;
  /** The correction on file, when they answered "no". */
  currentPlaybillName?: string;
}) {
  const [editing, setEditing] = useState(!responded);
  const [choice, setChoice] = useState<"yes" | "no" | null>(
    currentPlaybillName ? "no" : null
  );
  const bound = respondToCastingAction.bind(null, confirmationId);
  const [state, formAction, pending] = useActionState(
    async (prev: FamilyFormState, formData: FormData) => {
      const result = await bound(prev, formData);
      if (result.ok) setEditing(false);
      return result;
    },
    initial
  );

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3">
        <p className="text-sm">
          Playbill will print:{" "}
          <span className="font-semibold">{currentPlaybillName ?? studentName}</span> ✓
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {/* Named "decision", NOT "response": Netlify's platform rejects any
          multipart field ending in "_response" with a bare 403 before the
          request reaches the app (React prefixes field names, so "response"
          becomes "_1_response"). Diagnosed by replaying the captured POST
          and bisecting field names. Avoid that suffix in all form fields. */}
      <input type="hidden" name="decision" value={choice ?? ""} />

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
            defaultValue={currentPlaybillName ?? ""}
            placeholder={studentName}
            maxLength={80}
            required
          />
          <p className="text-xs text-muted-foreground">
            This goes to print exactly as typed — please double-check spelling,
            capitalization, and accents.
          </p>
        </div>
      )}

      <FieldError message={state.errors?._form} />

      <div className="flex gap-2">
        {choice && (
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Confirm"}
          </Button>
        )}
        {responded && (
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
