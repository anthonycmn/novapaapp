"use client";

import { useActionState, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { submitAuditionProfileAction } from "@/lib/actions/auditions";
import type { FamilyFormState } from "@/lib/actions/family";
import {
  NO_GUARANTEE_TEXT,
  ROLE_TIERS,
  type AuditionProfile,
} from "@/lib/api/auditions/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";
import { UnsavedChangesGuard } from "@/components/forms/unsaved-changes-guard";

const initial: FamilyFormState = { ok: false };

export function AuditionForm({
  studentId,
  productionId,
  studentName,
  existing,
}: {
  studentId: string;
  productionId: string;
  studentName: string;
  existing: AuditionProfile | null;
}) {
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: FamilyFormState, formData: FormData) => {
      const result = await submitAuditionProfileAction(prev, formData);
      if (result.ok) setDirty(false);
      return result;
    },
    initial
  );

  return (
    <form action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-5">
      <UnsavedChangesGuard dirty={dirty} />
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="productionId" value={productionId} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">
          What kind of role is {studentName} hoping for?
        </legend>
        {ROLE_TIERS.map((tier) => (
          <label
            key={tier.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent"
          >
            <input
              type="radio"
              name="preferenceTier"
              value={tier.value}
              defaultChecked={existing?.preferenceTier === tier.value}
              required
              className="mt-1 size-4 accent-[var(--primary)]"
            />
            <span>
              <span className="block text-sm font-semibold">{tier.label}</span>
              <span className="block text-sm text-muted-foreground">{tier.definition}</span>
            </span>
          </label>
        ))}
        <FieldError message={state.errors?.preferenceTier} />
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="previousRoles" className="text-sm font-medium">
          Previous roles (optional)
        </label>
        <Textarea
          id="previousRoles"
          name="previousRoles"
          defaultValue={existing?.previousRoles ?? ""}
          placeholder={"Young Anna — Frozen Jr. (2025)\nEnsemble — Annie Jr. (2024)"}
          className="min-h-24"
          maxLength={2000}
        />
        <p className="text-xs text-muted-foreground">
          Shows from NOVA PA are already on file — this is for anything else
          you&apos;d like the team to know about.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="hopes" className="text-sm font-medium">
          What is {studentName} hoping to get out of this experience?
        </label>
        <Textarea
          id="hopes"
          name="hopes"
          defaultValue={existing?.hopes ?? ""}
          placeholder="Growing confidence, making friends, trying a bigger part…"
          className="min-h-28"
          maxLength={2000}
        />
      </div>

      <div className="rounded-lg border border-gold/50 bg-accent p-4">
        <p className="flex items-start gap-2 text-sm font-medium text-accent-foreground">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          Please read before submitting
        </p>
        <p className="mt-2 text-sm text-accent-foreground">{NO_GUARANTEE_TEXT}</p>
        <label className="mt-3 flex min-h-11 items-start gap-2 text-sm font-medium text-accent-foreground">
          <input
            type="checkbox"
            name="acknowledged"
            defaultChecked={Boolean(existing)}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          We understand — sharing a preference does not guarantee any specific
          part or size of role.
        </label>
        <FieldError message={state.errors?.acknowledged} />
      </div>

      <FieldError message={state.errors?._form} />

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending
            ? "Saving…"
            : existing
              ? "Update audition info"
              : "Submit audition info"}
        </Button>
        {state.ok && (
          <p role="status" className="text-sm font-medium text-primary">
            Saved ✓
          </p>
        )}
      </div>
    </form>
  );
}
