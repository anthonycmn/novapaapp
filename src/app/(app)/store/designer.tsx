"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Upload } from "lucide-react";
import { addToCartAction } from "@/lib/actions/store";
import type { FamilyFormState } from "@/lib/actions/family";
import {
  BUTTON_PRICES_CENTS,
  type ButtonSize,
  type ButtonStyle,
  type ButtonTemplate,
  type Production,
  type Student,
} from "@/lib/api/types";
import { formatCents } from "@/lib/format";
import { readImageFile, ImageRejectedError, type PickedImage } from "@/lib/platform/image-picker";
import { assessPhotoQuality } from "@/lib/store-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/forms/field-error";
import { ButtonPreview } from "@/components/store/button-preview";

const initialState: FamilyFormState = { ok: false };

const SIZES: ButtonSize[] = ["2.25", "3", "3.5"];
const STYLES: Array<{ value: ButtonStyle; label: string }> = [
  { value: "classic", label: "Classic" },
  { value: "star", label: "Star" },
  { value: "ribbon", label: "Ribbon" },
];

export function ButtonDesigner({
  templates,
  productions,
  students,
}: {
  templates: ButtonTemplate[];
  productions: Production[];
  students: Student[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [studentName, setStudentName] = useState(
    students[0] ? (students[0].preferredName ?? students[0].firstName) : ""
  );
  const [role, setRole] = useState("");
  const [size, setSize] = useState<ButtonSize>("2.25");
  const [style, setStyle] = useState<ButtonStyle>("classic");
  const [quantity, setQuantity] = useState(1);
  const [acknowledged, setAcknowledged] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (prev: FamilyFormState, formData: FormData) => {
      const result = await addToCartAction(prev, formData);
      if (result.ok) router.push("/store/cart");
      return result;
    },
    initialState
  );

  const template = templates.find((t) => t.id === templateId);
  const production = productions.find((p) => p.id === template?.productionId);
  const quality = photo ? assessPhotoQuality(photo.width, photo.height, size) : null;
  const blocked = quality?.quality === "low" && !acknowledged;

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setAcknowledged(false);
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
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="photoUrl" value={photo?.dataUrl ?? ""} />
      <input type="hidden" name="photoWidth" value={photo?.width ?? 0} />
      <input type="hidden" name="photoHeight" value={photo?.height ?? 0} />
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="size" value={size} />
      <input type="hidden" name="style" value={style} />
      <input type="hidden" name="quantity" value={quantity} />
      <input type="hidden" name="acknowledgedLowRes" value={String(acknowledged)} />

      <div className="flex flex-col items-center gap-3">
        <ButtonPreview
          photoUrl={photo?.dataUrl}
          studentName={studentName}
          role={role}
          size={size}
          style={style}
          template={template}
          showTitle={production?.title}
        />
        <p className="text-sm text-muted-foreground">
          {size}&quot; · {formatCents(BUTTON_PRICES_CENTS[size])} each
        </p>
      </div>

      {templates.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="template">Show</Label>
          <select
            id="template"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-base"
          >
            {templates.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="photo">Photo</Label>
        <input
          ref={fileRef}
          id="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPickFile}
          className="sr-only"
        />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload aria-hidden />
          {photo ? "Choose a different photo" : "Upload a photo"}
        </Button>
        {photo && (
          <p className="text-xs text-muted-foreground">
            {photo.width}×{photo.height}px · {(photo.bytes / 1024 / 1024).toFixed(1)} MB
            {quality && ` · ~${quality.dpi} DPI at ${size}"`}
          </p>
        )}
        <FieldError message={photoError ?? state.errors?.photoUrl} />
      </div>

      {quality?.message && (
        <div
          role="alert"
          className={
            quality.quality === "low"
              ? "flex flex-col gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm"
              : "flex gap-2 rounded-lg bg-accent p-3 text-sm text-accent-foreground"
          }
        >
          <p className="flex items-start gap-2">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {quality.message}
          </p>
          {quality.quality === "low" && (
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Print it anyway — I understand it may look blurry
            </label>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="studentName">Name on button</Label>
          <Input
            id="studentName"
            name="studentName"
            value={studentName}
            onChange={(event) => setStudentName(event.target.value)}
            maxLength={40}
            required
            list="student-names"
          />
          <datalist id="student-names">
            {students.map((student) => (
              <option key={student.id} value={student.preferredName ?? student.firstName} />
            ))}
          </datalist>
          <FieldError message={state.errors?.studentName} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">Role</Label>
          <Input
            id="role"
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            maxLength={40}
            placeholder="Young Elsa"
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Size</legend>
        <div className="flex flex-wrap gap-2">
          {SIZES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setSize(option);
                setAcknowledged(false);
              }}
              aria-pressed={size === option}
              className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${
                size === option ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              {option}&quot; · {formatCents(BUTTON_PRICES_CENTS[option])}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Style</legend>
        <div className="flex flex-wrap gap-2">
          {STYLES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStyle(option.value)}
              aria-pressed={style === option.value}
              className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${
                style === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="quantity">Quantity</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
          >
            −
          </Button>
          <Input
            id="quantity"
            value={quantity}
            onChange={(event) =>
              setQuantity(Math.min(99, Math.max(1, Number(event.target.value) || 1)))
            }
            inputMode="numeric"
            className="w-20 text-center"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setQuantity((q) => Math.min(99, q + 1))}
            aria-label="Increase quantity"
          >
            +
          </Button>
          <p className="ml-2 text-sm text-muted-foreground">
            {formatCents(BUTTON_PRICES_CENTS[size] * quantity)} total
          </p>
        </div>
      </div>

      <FieldError message={state.errors?._form} />

      <Button type="submit" disabled={pending || !photo || blocked} size="lg">
        {pending ? "Adding…" : "Add to cart"}
      </Button>
      {blocked && (
        <p className="text-center text-sm text-muted-foreground">
          Confirm the resolution warning above, or pick a larger photo.
        </p>
      )}
    </form>
  );
}
