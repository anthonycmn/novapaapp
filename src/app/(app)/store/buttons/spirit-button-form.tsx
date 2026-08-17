"use client";

import { useActionState, useRef, useState } from "react";
import { AlertTriangle, Check, Upload } from "lucide-react";
import { submitSpiritButtonAction, type SubmissionState } from "@/lib/actions/spirit-button";
import {
  SPIRIT_BUTTON_PRICE_CENTS,
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

const initialState: SubmissionState = { ok: false };

const SIZES: ButtonSize[] = ["2.25", "3", "3.5"];
const STYLES: Array<{ value: ButtonStyle; label: string }> = [
  { value: "classic", label: "Classic" },
  { value: "star", label: "Star" },
  { value: "ribbon", label: "Ribbon" },
];

/**
 * Design one spirit button, and see it as you go.
 *
 * The preview is the point of the page, so it sits at the top and updates on
 * every keystroke — a parent should never wonder what they are buying.
 *
 * There is no payment here on purpose (Tony, 16 Aug 2026: "don't allow them to
 * purchase quite yet"). Submitting saves the design and tells the front office;
 * money is a conversation for later, and the button says so.
 */
export function SpiritButtonForm({
  template,
  production,
  students,
}: {
  template: ButtonTemplate;
  production: Production;
  students: Student[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);

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

  const boundAction = submitSpiritButtonAction.bind(null, production.title);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

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

  if (state.ok) {
    return (
      <div className="rounded-lg border border-primary/30 bg-card p-6 text-center shadow-[var(--shadow-card)]">
        <Check aria-hidden className="mx-auto size-7 text-primary" />
        <h2 className="mt-2 text-[17px] font-semibold">Design submitted</h2>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
          {state.message ??
            "Your design is saved and the front office has it. Nothing has been charged."}
        </p>
        <a
          href={`/store/buttons?show=${production.id}`}
          className="mt-4 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Design another
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4 lg:grid-cols-2">
      <input type="hidden" name="photoUrl" value={photo?.dataUrl ?? ""} />
      <input type="hidden" name="photoWidth" value={photo?.width ?? 0} />
      <input type="hidden" name="photoHeight" value={photo?.height ?? 0} />
      <input type="hidden" name="templateId" value={template.id} />
      <input type="hidden" name="size" value={size} />
      <input type="hidden" name="style" value={style} />
      <input type="hidden" name="quantity" value={quantity} />
      <input type="hidden" name="acknowledgedLowRes" value={String(acknowledged)} />

      {/* ---- What it will look like ---- */}
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-5 shadow-[var(--shadow-card)]">
        <ButtonPreview
          photoUrl={photo?.dataUrl}
          studentName={studentName}
          role={role}
          size={size}
          style={style}
          template={template}
          showTitle={production.title}
        />
        <p className="text-[13px] text-muted-foreground">
          {size}&quot; · {formatCents(SPIRIT_BUTTON_PRICE_CENTS)} each ·{" "}
          <span className="font-medium text-foreground">
            {formatCents(SPIRIT_BUTTON_PRICE_CENTS * quantity)} total
          </span>
        </p>
        {!photo && (
          <p className="text-center text-[12px] text-muted-foreground">
            Add a photo to see the finished button.
          </p>
        )}
      </div>

      {/* ---- The three things we need ---- */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="photo">Photo of your performer</Label>
          <input
            ref={fileRef}
            id="photo"
            type="file"
            accept="image/*"
            onChange={onPickFile}
            className="sr-only"
          />
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden />
            {photo ? "Choose a different photo" : "Upload a photo"}
          </Button>
          {photoError && <FieldError message={photoError} />}
          <FieldError message={state.errors?.photoUrl} />
          {quality?.message && (
            <label className="flex items-start gap-2 rounded-md border border-gold/40 bg-tip p-2.5 text-[12.5px] text-tip-foreground">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
              <span>
                {quality.message}
                {quality.quality === "low" && (
                  <span className="mt-1.5 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(event) => setAcknowledged(event.target.checked)}
                    />
                    Use it anyway
                  </span>
                )}
              </span>
            </label>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="studentName">Your performer&apos;s name</Label>
          {students.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {students.map((student) => {
                const name = student.preferredName ?? student.firstName;
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => setStudentName(name)}
                    className={`rounded-full border px-2.5 py-1 text-[12.5px] transition-colors ${
                      studentName === name
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
          <Input
            id="studentName"
            name="studentName"
            value={studentName}
            onChange={(event) => setStudentName(event.target.value)}
            maxLength={40}
            required
          />
          <FieldError message={state.errors?.studentName} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">Role, if you&apos;d like it on the button</Label>
          <Input
            id="role"
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            maxLength={40}
            placeholder="Optional"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="size">Size</Label>
            <select
              id="size"
              value={size}
              onChange={(event) => setSize(event.target.value as ButtonSize)}
              className="h-11 rounded-lg border border-input bg-card px-3 text-base"
            >
              {SIZES.map((option) => (
                <option key={option} value={option}>
                  {option}&quot;
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="style">Style</Label>
            <select
              id="style"
              value={style}
              onChange={(event) => setStyle(event.target.value as ButtonStyle)}
              className="h-11 rounded-lg border border-input bg-card px-3 text-base"
            >
              {STYLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantity">How many</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              max={99}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value) || 1)}
            />
          </div>
        </div>

        <FieldError message={state.errors?._form} />

        <Button type="submit" disabled={pending || !photo || blocked}>
          {pending ? "Submitting…" : "Submit this design"}
        </Button>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Submitting sends your design to the {`NOVA PA`} team — it does not
          charge you. We are not taking payment online yet, so the front office
          will confirm the total with you.
        </p>
      </div>
    </form>
  );
}
