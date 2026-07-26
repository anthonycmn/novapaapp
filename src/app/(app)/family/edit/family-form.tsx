"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { updateFamilyAction, type FamilyFormState } from "@/lib/actions/family";
import type { Family } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/forms/field-error";
import { UnsavedChangesGuard } from "@/components/forms/unsaved-changes-guard";

const initialState: FamilyFormState = { ok: false };

export function FamilyForm({ family }: { family: Family }) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: FamilyFormState, formData: FormData) => {
      const result = await updateFamilyAction(prev, formData);
      if (result.ok) {
        setDirty(false);
        router.push("/family");
      }
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-4">
      <UnsavedChangesGuard dirty={dirty} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="addressLine1">Street address</Label>
        <Input
          id="addressLine1"
          name="addressLine1"
          defaultValue={family.addressLine1}
          required
          autoComplete="address-line1"
          aria-invalid={!!state.errors?.addressLine1}
        />
        <FieldError message={state.errors?.addressLine1} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="addressLine2">Apt / unit (optional)</Label>
        <Input
          id="addressLine2"
          name="addressLine2"
          defaultValue={family.addressLine2 ?? ""}
          autoComplete="address-line2"
        />
      </div>

      <div className="grid grid-cols-6 gap-3">
        <div className="col-span-3 flex flex-col gap-1.5">
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" defaultValue={family.city} required autoComplete="address-level2" />
          <FieldError message={state.errors?.city} />
        </div>
        <div className="col-span-1 flex flex-col gap-1.5">
          <Label htmlFor="state">State</Label>
          <Input id="state" name="state" defaultValue={family.state} required maxLength={2} />
          <FieldError message={state.errors?.state} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="zip">ZIP</Label>
          <Input id="zip" name="zip" defaultValue={family.zip} required inputMode="numeric" autoComplete="postal-code" />
          <FieldError message={state.errors?.zip} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Preferred contact method</legend>
        <div className="flex gap-4">
          {(["email", "sms", "phone"] as const).map((method) => (
            <label key={method} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="preferredContactMethod"
                value={method}
                defaultChecked={family.preferredContactMethod === method}
                className="size-4 accent-[var(--primary)]"
              />
              {method === "sms" ? "Text (SMS)" : method[0].toUpperCase() + method.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>

      <FieldError message={state.errors?._form} />

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
