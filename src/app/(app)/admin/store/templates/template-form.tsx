"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Loader2, Upload, X } from "lucide-react";
import { saveButtonTemplateAction } from "@/lib/actions/button-templates";
import type { ButtonTemplate, Production } from "@/lib/api/types";
import type { FamilyFormState } from "@/lib/actions/family";
import { readImageFile, ImageRejectedError } from "@/lib/platform/image-picker";
import { renderButtonArtwork } from "@/lib/store/button-artwork";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/forms/field-error";

const initialState: FamilyFormState = { ok: false };

/**
 * Background budget: the press file's full-bleed circle is ~1000 px for a 3"
 * button, so 1600 px keeps headroom without writing megabytes into the row.
 */
const BACKGROUND_BUDGET = { maxEdge: 1600, maxBytes: 1_500_000 };

/** One production's button artwork: background, accent, and a live sample. */
export function TemplateForm({
  production,
  template,
}: {
  production: Production;
  template?: ButtonTemplate;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [background, setBackground] = useState<string>("");
  const [removed, setRemoved] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [accent, setAccent] = useState(template?.accentColor ?? "#8e1f2f");
  const [sample, setSample] = useState<string>("");
  const [state, formAction, pending] = useActionState(saveButtonTemplateAction, initialState);

  const effectiveBackground = removed
    ? undefined
    : background || template?.backgroundImageUrl;

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const picked = await readImageFile(file, BACKGROUND_BUDGET);
      setBackground(picked.dataUrl);
      setRemoved(false);
    } catch (error) {
      setUploadError(
        error instanceof ImageRejectedError ? error.message : "Could not read that image."
      );
    }
  }

  /* The sample is drawn by the same renderer the parent form and print file
     use, with a stand-in name — an admin approves the real geometry. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const canvas = await renderButtonArtwork(
          {
            backgroundUrl: effectiveBackground,
            accentColor: accent,
            photoIsCutout: false,
            studentName: "Performer Name",
            role: "Their Role",
            showTitle: production.title,
            size: "3",
          },
          448
        );
        if (!cancelled) setSample(canvas.toDataURL("image/jpeg", 0.85));
      } catch {
        if (!cancelled) setSample("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveBackground, accent, production.title]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-[var(--shadow-card)]"
    >
      <input type="hidden" name="templateId" value={template?.id ?? ""} />
      <input type="hidden" name="productionId" value={production.id} />
      <input type="hidden" name="name" value={template?.name ?? production.title} />
      <input type="hidden" name="seasonName" value={template?.seasonName ?? ""} />
      <input type="hidden" name="backgroundDataUrl" value={background} />
      <input type="hidden" name="removeBackground" value={String(removed)} />

      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[14.5px] font-semibold leading-snug">{production.title}</h2>
        {state.ok && (
          <span className="flex items-center gap-1 text-[12px] font-medium text-primary">
            <Check aria-hidden className="size-3.5" /> Saved
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {sample ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sample}
            alt={`Sample spirit button for ${production.title}`}
            className="size-36 shrink-0 select-none rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
          />
        ) : (
          <div className="flex size-36 shrink-0 items-center justify-center rounded-full bg-muted">
            <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}

        <div className="flex min-w-48 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`background-${production.id}`}>Background</Label>
            <input
              ref={fileRef}
              id={`background-${production.id}`}
              type="file"
              accept="image/*"
              onChange={onPickFile}
              className="sr-only"
            />
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Upload aria-hidden />
                {effectiveBackground ? "Replace background" : "Upload background"}
              </Button>
              {effectiveBackground && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBackground("");
                    setRemoved(true);
                  }}
                >
                  <X aria-hidden />
                  Remove
                </Button>
              )}
            </div>
            {uploadError && <FieldError message={uploadError} />}
            <FieldError message={state.errors?.backgroundDataUrl} />
            {!effectiveBackground && (
              <p className="text-[12px] text-muted-foreground">
                Without a background, buttons use the accent color below.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`accent-${production.id}`}>Accent color</Label>
            <div className="flex items-center gap-2">
              <input
                id={`accent-${production.id}`}
                name="accentColor"
                type="color"
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                className="h-9 w-14 cursor-pointer rounded-md border bg-transparent p-1"
              />
              <Input
                aria-label="Accent color hex"
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                maxLength={7}
                className="w-28"
              />
            </div>
            <FieldError message={state.errors?.accentColor} />
          </div>

          <FieldError message={state.errors?._form} />
          <Button type="submit" size="sm" disabled={pending} className="self-start">
            {pending ? "Saving…" : "Save artwork"}
          </Button>
        </div>
      </div>
    </form>
  );
}
