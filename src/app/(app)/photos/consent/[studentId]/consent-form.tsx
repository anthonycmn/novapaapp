"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Upload } from "lucide-react";
import { grantConsentAction } from "@/lib/actions/photos";
import type { FamilyFormState } from "@/lib/actions/family";
import { MAX_REFERENCE_PHOTOS, MIN_REFERENCE_PHOTOS } from "@/lib/api/photos/types";
import {
  ImageRejectedError,
  readImageFile,
  type PickedImage,
} from "@/lib/platform/image-picker";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/forms/field-error";

const initialState: FamilyFormState = { ok: false };

export function ConsentForm({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PickedImage[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const boundAction = grantConsentAction.bind(null, studentId);
  const [state, formAction, pending] = useActionState(
    async (prev: FamilyFormState, formData: FormData) => {
      const result = await boundAction(prev, formData);
      if (result.ok) router.push("/photos");
      return result;
    },
    initialState
  );

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setPhotoError(null);
    const next: PickedImage[] = [];
    for (const file of files.slice(0, MAX_REFERENCE_PHOTOS - photos.length)) {
      try {
        next.push(await readImageFile(file));
      } catch (error) {
        setPhotoError(
          error instanceof ImageRejectedError ? error.message : "Could not read that photo."
        );
      }
    }
    setPhotos((current) => [...current, ...next].slice(0, MAX_REFERENCE_PHOTOS));
    if (fileRef.current) fileRef.current.value = "";
  }

  const enough = photos.length >= MIN_REFERENCE_PHOTOS;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {photos.map((photo, index) => (
        <input key={index} type="hidden" name="photos" value={photo.dataUrl} />
      ))}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">
          Photos of {studentName} ({photos.length}/{MAX_REFERENCE_PHOTOS})
        </h2>
        <p className="text-sm text-muted-foreground">
          Upload {MIN_REFERENCE_PHOTOS}–{MAX_REFERENCE_PHOTOS} clear,
          front-facing photos. Different angles and lighting help.
        </p>

        {photos.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {photos.map((photo, index) => (
              <li key={index} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.dataUrl}
                  alt={`Reference photo ${index + 1}`}
                  className="size-24 rounded-lg object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Remove reference photo ${index + 1}`}
                  className="absolute -right-2 -top-2 inline-flex size-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={fileRef}
          id="reference-photos"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={onPick}
          className="sr-only"
        />
        {photos.length < MAX_REFERENCE_PHOTOS && (
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden />
            Add photos
          </Button>
        )}
        <FieldError message={photoError ?? state.errors?.photos} />
      </div>

      <label className="flex min-h-11 items-start gap-2 rounded-lg border p-3 text-sm">
        <input
          type="checkbox"
          name="understood"
          className="mt-0.5 size-4 accent-[var(--primary)]"
        />
        <span>
          I&apos;ve read how this works. I&apos;m {studentName}&apos;s parent or
          guardian, and I consent to face matching for {studentName}. I can turn
          it off at any time.
        </span>
      </label>
      <FieldError message={state.errors?.understood} />
      <FieldError message={state.errors?._form} />

      <Button type="submit" size="lg" disabled={pending || !enough}>
        {pending ? "Setting up…" : `Turn on photo matching for ${studentName}`}
      </Button>
      {!enough && (
        <p className="text-center text-sm text-muted-foreground">
          Add at least {MIN_REFERENCE_PHOTOS} photos to continue.
        </p>
      )}
    </form>
  );
}
