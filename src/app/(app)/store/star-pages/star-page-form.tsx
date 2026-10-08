"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Check, Loader2, Upload } from "lucide-react";
import { submitStarPageAction } from "@/lib/actions/star-page";
import type { SubmissionState } from "@/lib/actions/spirit-button";
import { priceFor, type Product } from "@/lib/api/store/catalog";
import type { Production, Student } from "@/lib/api/types";
import { formatCents } from "@/lib/format";
import { readImageFile, ImageRejectedError, type PickedImage } from "@/lib/platform/image-picker";
import {
  renderStarPage,
  renderStarPagePrintFile,
  starPageSize,
  type StarPageSpec,
} from "@/lib/store/star-page-artwork";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";

const initialState: SubmissionState = { ok: false };

/** Screen preview resolution; the print file is drawn at 300 DPI. */
const PREVIEW_PX_PER_INCH = 110;

/**
 * Design one star page on the show's graphic, and see it as it will print.
 *
 * CJ, 8 Oct 2026: "I will upload the graphic and then they can upload the
 * photo and text and it will show them what it will look like. I want them to
 * be available for purchase." The preview is drawn by lib/store/star-page-
 * artwork, the same renderer that makes the print file on add-to-cart, so the
 * page the family approves is the page the playbill receives.
 *
 * The message is never reformatted, because it is submitted as written (Tony,
 * 17 Aug 2026) - if a parent puts their line breaks somewhere deliberate, the
 * preview has to honor them or the preview is lying.
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
  const [preview, setPreview] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);

  const boundAction = submitStarPageAction.bind(null, production.title);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const maxLength = product.messageMaxLength ?? 600;
  const priceCents = priceFor(product, optionValue);
  const size = starPageSize(optionValue);

  const spec: StarPageSpec = {
    artworkUrl: product.artworkUrl,
    photoUrl: photo?.dataUrl,
    studentName,
    message,
    signature,
    pageSize: optionValue,
  };

  /* Redraw as they type. Debounced a touch so a fast typist is not redrawing
     a full canvas on every keystroke. */
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const canvas = await renderStarPage(spec, PREVIEW_PX_PER_INCH);
        if (!cancelled) setPreview(canvas.toDataURL("image/jpeg", 0.85));
      } catch {
        if (!cancelled) setPreview("");
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.artworkUrl, photo, studentName, message, signature, optionValue]);

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

  /* Draw the print file from exactly what the preview shows, then submit. */
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setDrawError(null);
    setDrawing(true);
    try {
      formData.set("printDataUrl", await renderStarPagePrintFile(spec));
    } catch {
      setDrawing(false);
      setDrawError("We could not draw the page in this browser. Please try again.");
      return;
    }
    setDrawing(false);
    startTransition(() => formAction(formData));
  }

  if (state.ok) {
    return (
      <div className="rounded-lg border border-primary/30 bg-card p-6 text-center shadow-[var(--shadow-card)]">
        <Check aria-hidden className="mx-auto size-7 text-primary" />
        <h2 className="mt-2 text-[17px] font-semibold">It&apos;s in your cart</h2>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
          {state.message ??
            "Your star page is designed and waiting in your cart. Nothing is charged until you check out."}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <a
            href="/store/cart"
            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Go to checkout
          </a>
          <a
            href={`/store/star-pages?show=${production.id}`}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-muted"
          >
            Make another
          </a>
        </div>
      </div>
    );
  }

  const busy = pending || drawing;

  return (
    <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-2">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="optionValue" value={optionValue} />
      <input type="hidden" name="quantity" value={1} />
      <input type="hidden" name="photoDataUrl" value={photo?.dataUrl ?? ""} />
      <input type="hidden" name="photoWidth" value={photo?.width ?? 0} />
      <input type="hidden" name="photoHeight" value={photo?.height ?? 0} />

      {/* ---- The page as it will print ---- */}
      <div className="flex flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
        <div
          className="mx-auto w-full"
          style={{
            maxWidth: size.width >= size.height ? "26rem" : `${(size.width / size.height) * 30}rem`,
            aspectRatio: `${size.width} / ${size.height}`,
          }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Preview of your star page"
              className="size-full select-none rounded-md border object-contain shadow-[var(--shadow-card)]"
            />
          ) : (
            <div className="flex size-full items-center justify-center rounded-md border bg-muted">
              <Loader2 aria-hidden className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
        <p className="text-center text-[13px] text-muted-foreground">
          {product.options.find((option) => option.value === optionValue)?.label} ·{" "}
          {size.width}&quot; × {size.height}&quot; ·{" "}
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
            accept="image/*,.heic,.heif"
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
            {message.length}/{maxLength} characters. We print it as you type it -
            spelling, line breaks and all - so give it a read before you add it.
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

        {drawError && <FieldError message={drawError} />}
        <FieldError message={state.errors?._form} />

        <Button type="submit" disabled={busy || !message.trim() || !photo || !studentName.trim()}>
          {busy ? "Adding…" : `Add to cart · ${formatCents(priceCents)}`}
        </Button>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Adding to the cart does not charge you - you&apos;ll see the total and
          pay by card at checkout. The preview is exactly what goes in the
          playbill.
        </p>
      </div>
    </form>
  );
}
