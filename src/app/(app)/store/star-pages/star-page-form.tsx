"use client";

import { useActionState, useRef, useState } from "react";
import { Check, Upload } from "lucide-react";
import { submitStarPageAction } from "@/lib/actions/star-page";
import type { SubmissionState } from "@/lib/actions/spirit-button";
import { priceFor, type Product } from "@/lib/api/store/catalog";
import type { Production, Student } from "@/lib/api/types";
import { formatCents } from "@/lib/format";
import { readImageFile, ImageRejectedError, type PickedImage } from "@/lib/platform/image-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";

const initialState: SubmissionState = { ok: false };

/** Rough page proportions, so the preview looks like the space they're buying. */
const ASPECT: Record<string, string> = {
  quarter: "aspect-[4/3]",
  half: "aspect-[4/5]",
  full: "aspect-[3/4]",
};

/**
 * Design one star page, and see it laid out as you type.
 *
 * The message is rendered with whitespace preserved and never reformatted,
 * because it is submitted as written (Tony, 17 Aug 2026) — if a parent puts
 * their line breaks somewhere deliberate, the preview has to honour them or
 * the preview is lying.
 */
export function StarPageForm({
  product,
  production,
  students,
}: {
  product: Product;
  production: Production;
  students: Student[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [optionValue, setOptionValue] = useState(product.options[0]?.value ?? "quarter");
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [studentName, setStudentName] = useState(
    students[0] ? (students[0].preferredName ?? students[0].firstName) : ""
  );
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");

  const boundAction = submitStarPageAction.bind(null, production.title);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const maxLength = product.messageMaxLength ?? 600;
  const priceCents = priceFor(product, optionValue);

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

  if (state.ok) {
    return (
      <div className="rounded-lg border border-primary/30 bg-card p-6 text-center shadow-[var(--shadow-card)]">
        <Check aria-hidden className="mx-auto size-7 text-primary" />
        <h2 className="mt-2 text-[17px] font-semibold">Star page submitted</h2>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
          {state.message ??
            "Your tribute is saved and the front office has it. Nothing has been charged."}
        </p>
        <a
          href={`/store/star-pages?show=${production.id}`}
          className="mt-4 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Submit another
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4 lg:grid-cols-2">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="optionValue" value={optionValue} />
      <input type="hidden" name="quantity" value={1} />
      <input type="hidden" name="photoDataUrl" value={photo?.dataUrl ?? ""} />
      <input type="hidden" name="photoWidth" value={photo?.width ?? 0} />
      <input type="hidden" name="photoHeight" value={photo?.height ?? 0} />

      {/* ---- The page as it will read ---- */}
      <div className="flex flex-col gap-2">
        <div
          className={`mx-auto w-full max-w-sm overflow-hidden rounded-lg border bg-card p-5 shadow-[var(--shadow-card)] ${
            ASPECT[optionValue] ?? "aspect-[4/3]"
          }`}
        >
          <div className="flex h-full flex-col items-center gap-2 overflow-hidden text-center">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo.dataUrl}
                alt=""
                className="max-h-[45%] w-auto rounded-md object-contain"
              />
            ) : (
              <div className="flex h-[45%] w-full items-center justify-center rounded-md border border-dashed text-[12px] text-muted-foreground">
                Your photo
              </div>
            )}
            <p className="text-[15px] font-semibold leading-tight">
              {studentName || "Your performer"}
            </p>
            {/* Whitespace preserved: their line breaks are their line breaks. */}
            <p className="min-h-0 flex-1 overflow-hidden whitespace-pre-wrap text-[12px] leading-snug text-muted-foreground">
              {message || "Your message will appear here, exactly as you write it."}
            </p>
            {signature && (
              <p className="text-[12px] font-medium italic">{signature}</p>
            )}
          </div>
        </div>
        <p className="text-center text-[13px] text-muted-foreground">
          {product.options.find((option) => option.value === optionValue)?.label} ·{" "}
          <span className="font-medium text-foreground">{formatCents(priceCents)}</span>
        </p>
      </div>

      {/* ---- What we need from them ---- */}
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[13px] font-medium">
            {product.optionLabel ?? "Page size"}
          </legend>
          <div className="flex flex-col gap-1.5">
            {product.options.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-3 transition-colors ${
                  optionValue === option.value
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted"
                }`}
              >
                <input
                  type="radio"
                  name="pageSizeChoice"
                  value={option.value}
                  checked={optionValue === option.value}
                  onChange={() => setOptionValue(option.value)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium">{option.label}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {option.description ?? formatCents(priceFor(product, option.value))}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="photo">Photo for the page</Label>
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
          <FieldError message={state.errors?.photoDataUrl} />
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
            maxLength={60}
            required
          />
          <FieldError message={state.errors?.studentName} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="message">
            {product.messageLabel ?? "Your message, printed exactly as written"}
          </Label>
          <Textarea
            id="message"
            name="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={maxLength}
            rows={6}
            required
          />
          <p className="text-[12px] text-muted-foreground">
            {message.length}/{maxLength} characters. We print it as you type it —
            spelling, line breaks and all — so give it a read before you send.
          </p>
          <FieldError message={state.errors?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signature">Signed (optional)</Label>
          <Input
            id="signature"
            name="signature"
            value={signature}
            onChange={(event) => setSignature(event.target.value)}
            maxLength={80}
            placeholder="Love, Mom and Dad"
          />
        </div>

        <FieldError message={state.errors?._form} />

        <Button type="submit" disabled={pending || !message.trim() || !photo}>
          {pending ? "Submitting…" : `Submit this star page · ${formatCents(priceCents)}`}
        </Button>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Submitting sends your tribute to the NOVA PA team — it does not charge
          you. We are not taking payment online yet, so the front office will
          confirm the total with you.
        </p>
      </div>
    </form>
  );
}
