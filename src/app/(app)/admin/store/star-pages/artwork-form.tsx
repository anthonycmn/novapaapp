"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Loader2, Upload, X } from "lucide-react";
import { saveStarPageArtworkAction } from "@/lib/actions/star-page";
import type { FamilyFormState } from "@/lib/actions/family";
import type { Product } from "@/lib/api/store/catalog";
import { readImageFile, ImageRejectedError } from "@/lib/platform/image-picker";
import { renderStarPage } from "@/lib/store/star-page-artwork";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/forms/field-error";

const initialState: FamilyFormState = { ok: false };

/**
 * A 300 DPI full page is 1500 × 2400, so the graphic keeps up to 2600 px on
 * its long edge - enough to print sharp, small enough to sit on the row.
 */
const ARTWORK_BUDGET = { maxEdge: 2600, maxBytes: 2_500_000 };

/** One show's star page graphic, with a sample page drawn on it. */
export function StarPageArtworkForm({ product, title }: { product: Product; title: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState("");
  const [removed, setRemoved] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sample, setSample] = useState("");
  const [state, formAction, pending] = useActionState(saveStarPageArtworkAction, initialState);

  const artwork = removed ? undefined : picked || product.artworkUrl;
  const dirty = !!picked || (removed && !!product.artworkUrl);

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      setPicked((await readImageFile(file, ARTWORK_BUDGET)).dataUrl);
      setRemoved(false);
    } catch (error) {
      setUploadError(
        error instanceof ImageRejectedError ? error.message : "Could not read that image."
      );
    }
    event.target.value = "";
  }

  /* The sample is drawn by the same renderer families and the print file use. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const canvas = await renderStarPage(
          {
            artworkUrl: artwork,
            studentName: "Performer Name",
            message: "Break a leg! We are so proud of you.\nLove you to the moon.",
            signature: "Love, Mom and Dad",
            pageSize: "full",
          },
          48
        );
        if (!cancelled) setSample(canvas.toDataURL("image/jpeg", 0.85));
      } catch {
        if (!cancelled) setSample("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artwork]);

  /* After a save, the server's copy is the truth again. */
  useEffect(() => {
    if (state.ok) {
      setPicked("");
      setRemoved(false);
    }
  }, [state]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-[var(--shadow-card)]"
    >
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="artworkDataUrl" value={picked} />
      <input type="hidden" name="removeArtwork" value={String(removed && !picked)} />

      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[14.5px] font-semibold leading-snug">{title}</h2>
        <span
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${
            product.artworkUrl ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {state.ok && !dirty && <Check aria-hidden className="size-3" />}
          {product.artworkUrl ? "On sale" : "Not on sale"}
        </span>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {sample ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sample}
            alt={`Sample star page for ${title}`}
            className="w-36 shrink-0 select-none rounded-md border shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
          />
        ) : (
          <div className="flex aspect-[5/8] w-36 shrink-0 items-center justify-center rounded-md bg-muted">
            <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}

        <div className="flex min-w-48 flex-1 flex-col gap-2">
          <input
            ref={fileRef}
            id={`artwork-${product.id}`}
            type="file"
            accept="image/*,.heic,.heif"
            onChange={onPickFile}
            className="sr-only"
          />
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload aria-hidden />
              {artwork ? "Replace graphic" : "Upload graphic"}
            </Button>
            {artwork && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPicked("");
                  setRemoved(true);
                }}
              >
                <X aria-hidden />
                Remove
              </Button>
            )}
          </div>
          {uploadError && <FieldError message={uploadError} />}
          <FieldError message={state.errors?.artworkDataUrl} />
          <FieldError message={state.errors?._form} />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Portrait works best (5 × 8). The graphic fills the page; the family&apos;s
            photo and words sit on top, so leave the middle calm. Quarter and half
            pages crop it to their own shape.
          </p>
          <Button type="submit" size="sm" disabled={pending || !dirty} className="self-start">
            {pending ? "Saving…" : removed && !picked ? "Take off sale" : "Save and put on sale"}
          </Button>
        </div>
      </div>
    </form>
  );
}
