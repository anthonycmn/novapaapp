"use client";

import { useActionState, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { submitStaffChangesAction } from "@/lib/actions/materials";
import type { FamilyFormState } from "@/lib/actions/family";
import type { StaffProfile } from "@/lib/api/types";
import { readImageFile, ImageRejectedError } from "@/lib/platform/image-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";
import { UnsavedChangesGuard } from "@/components/forms/unsaved-changes-guard";

const initial: FamilyFormState = { ok: false };

export function StaffEditForm({ profile }: { profile: StaffProfile }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const bound = submitStaffChangesAction.bind(null, profile.id);
  const [state, formAction, pending] = useActionState(
    async (prev: FamilyFormState, formData: FormData) => {
      const result = await bound(prev, formData);
      if (result.ok) setDirty(false);
      return result;
    },
    initial
  );

  // Show what's awaiting approval, falling back to what's live.
  const pendingChanges = profile.pendingChanges ?? {};
  const value = <K extends keyof typeof pendingChanges>(key: K) =>
    (pendingChanges[key] ?? profile[key as keyof StaffProfile]) as string | undefined;

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    try {
      const picked = await readImageFile(file);
      setPhotoDataUrl(picked.dataUrl);
      setDirty(true);
    } catch (error) {
      setPhotoError(
        error instanceof ImageRejectedError ? error.message : "Could not read that photo."
      );
    }
  }

  const previewPhoto = photoDataUrl || pendingChanges.photoUrl || profile.photoUrl;

  return (
    <form action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-4">
      <UnsavedChangesGuard dirty={dirty} />
      <input type="hidden" name="photoDataUrl" value={photoDataUrl} />

      <div className="flex items-center gap-4">
        {previewPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewPhoto}
            alt="Your profile photo"
            className="size-24 rounded-full border object-cover"
          />
        ) : (
          <div className="flex size-24 items-center justify-center rounded-full border border-dashed text-center text-xs text-muted-foreground">
            No photo
          </div>
        )}
        <div>
          <input
            ref={fileRef}
            id="staff-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPick}
            className="sr-only"
          />
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden />
            {previewPhoto ? "Replace photo" : "Add a photo"}
          </Button>
          <FieldError message={photoError ?? undefined} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={value("title") ?? ""} maxLength={80} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          name="bio"
          defaultValue={value("bio") ?? ""}
          className="min-h-32"
          maxLength={2000}
        />
        <p className="text-xs text-muted-foreground">
          Families read this on your profile. A couple of sentences is plenty.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="specialties">Specialties</Label>
        <Input
          id="specialties"
          name="specialties"
          defaultValue={(pendingChanges.specialties ?? profile.specialties).join(", ")}
          placeholder="Choreography, Tap, Jazz"
        />
        <p className="text-xs text-muted-foreground">Separate with commas.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="credits">Credits &amp; training</Label>
        <Textarea
          id="credits"
          name="credits"
          defaultValue={value("credits") ?? ""}
          className="min-h-24"
          maxLength={2000}
        />
      </div>

      <FieldError message={state.errors?._form} />

      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit for approval"}
      </Button>
      {state.ok && (
        <p role="status" className="text-sm font-medium text-primary">
          ✓ Sent to an administrator for review. Your current profile stays live
          until they approve it.
        </p>
      )}
    </form>
  );
}
