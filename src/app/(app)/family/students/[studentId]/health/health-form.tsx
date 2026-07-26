"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { saveHealthFormAction } from "@/lib/actions/health";
import type { FamilyFormState } from "@/lib/actions/family";
import type { HealthForm as HealthFormRecord } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";
import { UnsavedChangesGuard } from "@/components/forms/unsaved-changes-guard";

const initialState: FamilyFormState = { ok: false };

/**
 * Annual health form (#9). When a previous season's form exists, its answers
 * pre-fill so the parent confirms or edits rather than re-typing everything.
 */
export function HealthFormEditor({
  studentId,
  seasonId,
  studentName,
  current,
  previous,
}: {
  studentId: string;
  seasonId: string;
  studentName: string;
  current: HealthFormRecord | null;
  previous: HealthFormRecord | null;
}) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const source = current ?? previous;
  const answers = source?.answers;
  const isReattest = !current && !!previous;

  const boundAction = saveHealthFormAction.bind(null, studentId, seasonId);
  const [state, formAction, pending] = useActionState(
    async (prev: FamilyFormState, formData: FormData) => {
      const result = await boundAction(prev, formData);
      if (result.ok) {
        setDirty(false);
        router.push(`/family/students/${studentId}`);
      }
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-5">
      <UnsavedChangesGuard dirty={dirty} />

      {isReattest && (
        <div className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
          We&apos;ve filled in last season&apos;s answers. Please review, update
          anything that changed, and sign again.
        </div>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">Health</legend>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="allergies">Allergies</Label>
          <Textarea
            id="allergies"
            name="allergies"
            defaultValue={answers?.allergies ?? ""}
            placeholder="Food, medication, environmental — and what to do"
            className="min-h-16"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="medications">Medications</Label>
          <Textarea
            id="medications"
            name="medications"
            defaultValue={answers?.medications ?? ""}
            placeholder="Name, dose, and when it's taken"
            className="min-h-16"
          />
        </div>

        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="medicationAuthorization"
            defaultChecked={answers?.medicationAuthorization ?? false}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          I authorize NOVA PA staff to assist {studentName} with the medications
          listed above.
        </label>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="conditions">Medical conditions</Label>
          <Textarea
            id="conditions"
            name="conditions"
            defaultValue={answers?.conditions ?? ""}
            className="min-h-16"
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">Physician & insurance</legend>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="physicianName">Physician</Label>
            <Input
              id="physicianName"
              name="physicianName"
              defaultValue={answers?.physicianName ?? ""}
              required
              aria-invalid={!!state.errors?.physicianName}
            />
            <FieldError message={state.errors?.physicianName} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="physicianPhone">Physician phone</Label>
            <Input
              id="physicianPhone"
              name="physicianPhone"
              type="tel"
              defaultValue={answers?.physicianPhone ?? ""}
              required
            />
            <FieldError message={state.errors?.physicianPhone} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="insuranceCarrier">Insurance carrier</Label>
            <Input
              id="insuranceCarrier"
              name="insuranceCarrier"
              defaultValue={answers?.insuranceCarrier ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="insurancePolicyNumber">Policy number</Label>
            <Input
              id="insurancePolicyNumber"
              name="insurancePolicyNumber"
              defaultValue={answers?.insurancePolicyNumber ?? ""}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">Care & access</legend>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dietaryRestrictions">Dietary restrictions</Label>
          <Textarea
            id="dietaryRestrictions"
            name="dietaryRestrictions"
            defaultValue={answers?.dietaryRestrictions ?? ""}
            className="min-h-16"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accessibilityNeeds">Accessibility needs</Label>
          <Textarea
            id="accessibilityNeeds"
            name="accessibilityNeeds"
            defaultValue={answers?.accessibilityNeeds ?? ""}
            placeholder="Anything that helps us support your child fully"
            className="min-h-16"
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Consent & signature</legend>

        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="emergencyTreatmentConsent"
            defaultChecked={answers?.emergencyTreatmentConsent ?? false}
            className="mt-0.5 size-4 accent-[var(--primary)]"
            required
          />
          In an emergency where I cannot be reached, I authorize NOVA PA to
          secure emergency medical treatment for {studentName}.
        </label>
        <FieldError message={state.errors?.emergencyTreatmentConsent} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signature">Type your full name to sign</Label>
          <Input
            id="signature"
            name="signature"
            placeholder="Your full legal name"
            required
            aria-invalid={!!state.errors?.signature}
          />
          <FieldError message={state.errors?.signature} />
          <p className="text-xs text-muted-foreground">
            Your name, the date and time, and your IP address are recorded as
            your electronic signature.
          </p>
        </div>
      </fieldset>

      <FieldError message={state.errors?._form} />

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting…" : current ? "Update & re-sign" : "Sign & submit"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
