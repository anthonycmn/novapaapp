"use client";

import { useActionState, useRef, useState } from "react";
import { Check, Plus, Upload, UserPlus } from "lucide-react";
import { addGuardianAction, updateGuardianAction } from "@/lib/actions/guardians";
import type { FamilyFormState } from "@/lib/actions/family";
import type { Guardian } from "@/lib/api/types";
import { readImageFile, ImageRejectedError, type PickedImage } from "@/lib/platform/image-picker";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/forms/field-error";
import { SectionHeader } from "@/components/ui/section-header";

const initialState: FamilyFormState = { ok: false };

/**
 * The grown-ups on this household, each editable in place.
 *
 * Tony, 17 Aug 2026: "Add a second parent, add a third parent, add a fourth
 * parent if they would like to. The third and fourth should be a button that
 * says add additional, and then it adds."
 *
 * So the form does not pre-render four empty parents. Whoever exists is shown;
 * "Add another parent or guardian" reveals one blank row at a time. Four empty
 * slots reads as an obligation to fill them.
 */
export function GuardiansEditor({ guardians }: { guardians: Guardian[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <Card pad={false}>
      <SectionHeader
        title="Parents & guardians"
        inCard
        right={
          <span className="text-[12px] text-muted-foreground">
            {guardians.length} on this household
          </span>
        }
      />

      <ul className="divide-y">
        {guardians.map((guardian) => (
          <li key={guardian.id}>
            <GuardianRow guardian={guardian} />
          </li>
        ))}
      </ul>

      <div className="border-t p-4">
        {adding ? (
          <NewGuardianRow onDone={() => setAdding(false)} />
        ) : (
          <Button type="button" variant="outline" onClick={() => setAdding(true)}>
            <UserPlus aria-hidden />
            Add another parent or guardian
          </Button>
        )}
      </div>
    </Card>
  );
}

function GuardianRow({ guardian }: { guardian: Guardian }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const boundAction = updateGuardianAction.bind(null, guardian.id);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    try {
      setPhoto(await readImageFile(file));
    } catch (error) {
      setPhoto(null);
      setPhotoError(
        error instanceof ImageRejectedError ? error.message : "Could not read that photo."
      );
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 p-4">
      <input type="hidden" name="photoDataUrl" value={photo?.dataUrl ?? ""} />

      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1.5">
          <Avatar
            name={guardian.fullName || "New parent"}
            src={photo?.dataUrl ?? guardian.photoUrl}
            className="size-12 text-[13px]"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPickFile}
            className="sr-only"
            aria-label={`Photo of ${guardian.fullName || "this parent"}`}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 text-[11.5px] text-primary underline-offset-4 hover:underline"
          >
            <Upload aria-hidden size={11} />
            Photo
          </button>
        </div>

        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`name-${guardian.id}`}>
              Name
              {guardian.isPrimary && (
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  Primary contact
                </span>
              )}
            </Label>
            <Input
              id={`name-${guardian.id}`}
              name="fullName"
              defaultValue={guardian.fullName}
              autoComplete="name"
              required
            />
            <FieldError message={state.errors?.fullName} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`rel-${guardian.id}`}>Relationship</Label>
            <Input
              id={`rel-${guardian.id}`}
              name="relationship"
              defaultValue={guardian.relationship}
              placeholder="Mother, Father, Grandparent…"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`email-${guardian.id}`}>Email</Label>
            <Input
              id={`email-${guardian.id}`}
              name="email"
              type="email"
              defaultValue={guardian.email}
              autoComplete="email"
            />
            <FieldError message={state.errors?.email} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`phone-${guardian.id}`}>Phone</Label>
            <Input
              id={`phone-${guardian.id}`}
              name="phone"
              type="tel"
              defaultValue={guardian.phone}
              autoComplete="tel"
              placeholder="Show-week changes go out by text"
            />
            <FieldError message={state.errors?.phone} />
          </div>
        </div>
      </div>

      {photoError && <FieldError message={photoError} />}
      <FieldError message={state.errors?.photoDataUrl} />
      <FieldError message={state.errors?._form} />

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.ok && (
          <span className="inline-flex items-center gap-1 text-[12.5px] text-primary">
            <Check aria-hidden size={13} />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}

function NewGuardianRow({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(addGuardianAction, initialState);

  // Once the server confirms, collapse back to the button so the next "add
  // additional" starts from a clean row rather than the one just saved.
  if (state.ok) {
    onDone();
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-[13px] font-medium">Add a parent or guardian</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newFullName">Name</Label>
          <Input id="newFullName" name="newFullName" autoComplete="name" required />
          <FieldError message={state.errors?.newFullName} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newRelationship">Relationship</Label>
          <Input
            id="newRelationship"
            name="newRelationship"
            placeholder="Mother, Father, Grandparent…"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newEmail">Email</Label>
          <Input id="newEmail" name="newEmail" type="email" autoComplete="email" />
          <FieldError message={state.errors?.newEmail} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newPhone">Phone</Label>
          <Input id="newPhone" name="newPhone" type="tel" autoComplete="tel" />
          <FieldError message={state.errors?.newPhone} />
        </div>
      </div>
      <FieldError message={state.errors?._form} />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          <Plus aria-hidden />
          {pending ? "Adding…" : "Add"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        Adding someone here records them as a guardian. It does not give them a
        login — the front office sends an invitation separately.
      </p>
    </form>
  );
}
