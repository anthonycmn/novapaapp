"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Loader2, Upload, X } from "lucide-react";
import { saveStarPageArtworkAction } from "@/lib/actions/star-page";
import type { FamilyFormState } from "@/lib/actions/family";
import type { Product } from "@/lib/api/store/catalog";
import { readImageFile, ImageRejectedError } from "@/lib/platform/image-picker";
import {
  renderStarPage,
  starPageLayout,
  STAR_PAGE_SIZES,
} from "@/lib/store/star-page-artwork";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/forms/field-error";

const initialState: FamilyFormState = { ok: false };

/**
 * A 300 DPI full page is 1500 px wide, so the graphic keeps up to 2600 px on
 * its long edge - enough to print sharp, small enough to sit on the row.
 */
const ARTWORK_BUDGET = { maxEdge: 2600, maxBytes: 2_500_000 };

const SIZE_LABEL: Record<string, string> = {
  quarter: "Quarter page",
  half: "Half page",
  full: "Full page",
};

/**
 * One show's star page graphics - one per page size (CJ, 10 Oct 2026: "I
 * upload three different graphics - the quarter page, half page, and full
 * page"). Each size goes on sale to the show's families when its graphic is
 * saved, and only that size.
 */
export function StarPageArtworkForm({ product, title }: { product: Product; title: string }) {
  const onSale = STAR_PAGE_SIZES.filter(
    (size) => product.artworkBySize?.[size] || product.artworkUrl
  );
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[14.5px] font-semibold leading-snug">{title}</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${
            onSale.length ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {onSale.length
            ? `On sale: ${onSale.map((size) => SIZE_LABEL[size].split(" ")[0]).join(", ")}`
            : "Not on sale"}
        </span>
      </div>
      {product.artworkUrl && (
        <p className="text-[12px] text-muted-foreground">
          This show also has an older single graphic, used for any size below that has no
          graphic of its own.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {STAR_PAGE_SIZES.map((size) => (
          <SizeSlot
            key={size}
            productId={product.id}
            size={size}
            title={title}
            saved={product.artworkBySize?.[size]}
          />
        ))}
      </div>
    </div>
  );
}

function SizeSlot({
  productId,
  size,
  title,
  saved,
}: {
  productId: string;
  size: string;
  title: string;
  saved?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState("");
  const [removed, setRemoved] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sample, setSample] = useState("");
  const [spaces, setSpaces] = useState<number | null>(null);
  const [state, formAction, pending] = useActionState(saveStarPageArtworkAction, initialState);

  const artwork = removed ? undefined : picked || saved;
  const dirty = !!picked || (removed && !!saved);

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

  /* The sample is drawn by the same renderer families and the print file use,
     with stand-in words, so the photo spaces it finds are the ones families get. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const layout = artwork ? await starPageLayout(artwork) : undefined;
        const canvas = await renderStarPage(
          {
            artworkUrl: artwork,
            photoUrls: [],
            studentName: "Performer Name",
            message: "Break a leg! We are so proud of you.\nLove you to the moon.",
            signature: "Love, Mom and Dad",
            pageSize: size,
          },
          60
        );
        if (!cancelled) {
          setSpaces(layout ? layout.frames.length : null);
          setSample(canvas.toDataURL("image/jpeg", 0.85));
        }
      } catch {
        if (!cancelled) setSample("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artwork, size]);

  /* After a save, the server's copy is the truth again. */
  useEffect(() => {
    if (state.ok) {
      setPicked("");
      setRemoved(false);
    }
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-md border p-2.5">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="pageSize" value={size} />
      <input type="hidden" name="artworkDataUrl" value={picked} />
      <input type="hidden" name="removeArtwork" value={String(removed && !picked)} />

      <div className="flex items-center justify-between gap-1">
        <span className="text-[13px] font-medium">{SIZE_LABEL[size]}</span>
        {saved && !dirty && (
          <span className="flex items-center gap-0.5 text-[11.5px] font-medium text-primary">
            <Check aria-hidden className="size-3" /> On sale
          </span>
        )}
      </div>

      {sample ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sample}
          alt={`Sample ${SIZE_LABEL[size].toLowerCase()} for ${title}`}
          className="max-h-56 w-full select-none rounded border object-contain"
        />
      ) : (
        <div className="flex h-40 items-center justify-center rounded bg-muted">
          <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {artwork && spaces !== null && (
        <p className={`text-[11.5px] ${spaces ? "text-muted-foreground" : "text-destructive"}`}>
          {spaces
            ? `Found ${spaces} photo space${spaces === 1 ? "" : "s"} - families upload ${spaces === 1 ? "one photo" : `${spaces} photos`}.`
            : "No black photo space found - the photo will be laid over the graphic instead."}
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        onChange={onPickFile}
        className="sr-only"
      />
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload aria-hidden />
          {artwork ? "Replace" : "Upload"}
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
      <Button type="submit" size="sm" disabled={pending || !dirty} className="self-start">
        {pending ? "Saving…" : removed && !picked ? "Take off sale" : "Save"}
      </Button>
    </form>
  );
}
