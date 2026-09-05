"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Scissors, Upload } from "lucide-react";
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
import { cutOutPerson, CutoutUnavailableError, type CutoutResult } from "@/lib/store/cutout";
import { renderPrintFile } from "@/lib/store/button-artwork";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/forms/field-error";
import { ButtonPreview } from "@/components/store/button-preview";

const initialState: SubmissionState = { ok: false };

/*
 * One size, one style — CJ, 4 Sep 2026: "all buttons are 3 inches and ribbons -
 * no choices."
 *
 * They were pickers offering three sizes and three styles, which asked a parent
 * to make two decisions we do not actually offer: the press takes one die and
 * the ribbons are what we stock. A choice that is not a choice is a chance to
 * pick the wrong one and a support email afterwards.
 *
 * Still submitted as hidden fields under the same names, so the cart, the
 * manifest the press works from, and size_inches in the database all read
 * exactly as they did.
 */
const FIXED_SIZE: ButtonSize = "3";
const FIXED_STYLE: ButtonStyle = "ribbon";

/**
 * Design one spirit button, and see it as you go.
 *
 * CJ, 5 Sep 2026: upload a photo, the system cuts the child out, sets them on
 * the show's background with the name and role, and the parent sees "what
 * their spirit button is going to look like before it even gets printed" —
 * with that same image going to the button producer.
 *
 * So the preview here IS the print file: renderPrintFile draws the button once
 * at press resolution, the <img> shows it scaled down, and submit posts the
 * identical data URL. Nothing can look different on the press than on this
 * screen. The cutout is best-effort — when it can't run (old browser, no
 * person found) the plain photo fills the button the way it always did, and
 * the parent is told in one quiet line.
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
  const [cutout, setCutout] = useState<CutoutResult | null>(null);
  const [cutting, setCutting] = useState(false);
  const [cutoutNote, setCutoutNote] = useState<string | null>(null);
  const [artwork, setArtwork] = useState<string>("");
  const [studentName, setStudentName] = useState(
    students[0] ? (students[0].preferredName ?? students[0].firstName) : ""
  );
  const [role, setRole] = useState("");
  const size = FIXED_SIZE;
  const style = FIXED_STYLE;
  const [quantity, setQuantity] = useState(1);
  const [acknowledged, setAcknowledged] = useState(false);

  // A pick supersedes any cutout or render still in flight for the previous
  // photo; anything finishing under an older token is dropped silently.
  const pickToken = useRef(0);

  const boundAction = submitSpiritButtonAction.bind(null, production.title);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const quality = photo ? assessPhotoQuality(photo.width, photo.height, size) : null;
  const blocked = quality?.quality === "low" && !acknowledged;

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const token = ++pickToken.current;
    setPhotoError(null);
    setCutoutNote(null);
    setCutout(null);
    setAcknowledged(false);

    let picked: PickedImage;
    try {
      picked = await readImageFile(file);
    } catch (error) {
      if (token !== pickToken.current) return;
      setPhoto(null);
      setPhotoError(
        error instanceof ImageRejectedError ? error.message : "Could not read that photo."
      );
      return;
    }
    if (token !== pickToken.current) return;
    setPhoto(picked);

    setCutting(true);
    try {
      const cut = await cutOutPerson(picked.dataUrl);
      if (token !== pickToken.current) return;
      setCutout(cut);
    } catch (error) {
      if (token !== pickToken.current) return;
      setCutout(null);
      setCutoutNote(
        error instanceof CutoutUnavailableError
          ? error.message
          : "The automatic cutout didn't work on this photo, so it will be used as-is."
      );
    } finally {
      if (token === pickToken.current) setCutting(false);
    }
  }

  /*
   * Re-draw the artwork whenever anything on the button changes. Debounced a
   * beat so typing a name doesn't render 300-DPI artwork per keystroke; the
   * token guard keeps a slow render from overwriting a newer one.
   */
  useEffect(() => {
    if (!photo || cutting) {
      setArtwork("");
      return;
    }
    const token = pickToken.current;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const drawn = await renderPrintFile({
          backgroundUrl: template.backgroundImageUrl,
          accentColor: template.accentColor,
          photoUrl: cutout?.dataUrl ?? photo.dataUrl,
          photoIsCutout: Boolean(cutout),
          studentName,
          role,
          showTitle: production.title,
          size,
        });
        if (!cancelled && token === pickToken.current) setArtwork(drawn);
      } catch {
        // The preview failing to draw should never strand the form; the
        // submit button stays disabled until a drawing exists, which tells
        // the parent something is wrong without a modal.
        if (!cancelled && token === pickToken.current) setArtwork("");
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [photo, cutout, cutting, studentName, role, size, template, production.title]);

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
      <input type="hidden" name="photoUrl" value={cutout?.dataUrl ?? photo?.dataUrl ?? ""} />
      <input type="hidden" name="printUrl" value={artwork} />
      <input type="hidden" name="photoWidth" value={photo?.width ?? 0} />
      <input type="hidden" name="photoHeight" value={photo?.height ?? 0} />
      <input type="hidden" name="templateId" value={template.id} />
      <input type="hidden" name="size" value={size} />
      <input type="hidden" name="style" value={style} />
      <input type="hidden" name="quantity" value={quantity} />
      <input type="hidden" name="acknowledgedLowRes" value={String(acknowledged)} />

      {/* ---- What it will look like ---- */}
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-5 shadow-[var(--shadow-card)]">
        {artwork ? (
          // The drawing shown here is byte-for-byte what goes to the press.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artwork}
            alt={`Preview of ${studentName || "your performer"}'s spirit button`}
            className="size-56 select-none rounded-full shadow-[0_6px_18px_rgba(0,0,0,0.18)]"
          />
        ) : cutting || photo ? (
          <div className="flex size-56 flex-col items-center justify-center gap-2 rounded-full bg-muted text-muted-foreground">
            <Loader2 aria-hidden className="size-5 animate-spin" />
            <span className="px-6 text-center text-[12px]">
              {cutting ? "Cutting out your performer…" : "Drawing your button…"}
            </span>
          </div>
        ) : (
          <ButtonPreview
            studentName={studentName}
            role={role}
            size={size}
            style={style}
            template={template}
            showTitle={production.title}
          />
        )}
        <p className="text-[13px] text-muted-foreground">
          {size}&quot; with a ribbon · {formatCents(SPIRIT_BUTTON_PRICE_CENTS)} each ·{" "}
          <span className="font-medium text-foreground">
            {formatCents(SPIRIT_BUTTON_PRICE_CENTS * quantity)} total
          </span>
        </p>
        {!photo && (
          <p className="text-center text-[12px] text-muted-foreground">
            Add a photo to see the finished button.
          </p>
        )}
        {cutout && artwork && (
          <p className="flex items-center gap-1.5 text-center text-[12px] text-muted-foreground">
            <Scissors aria-hidden className="size-3.5 shrink-0" />
            We cut your performer out automatically — this is exactly what gets
            printed.
          </p>
        )}
        {cutoutNote && (
          <p className="text-center text-[12px] text-muted-foreground">{cutoutNote}</p>
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

        {/* Size and style are no longer asked — see FIXED_SIZE above. What a
            parent is getting is said in the line under the preview instead. */}
        <div className="grid gap-3 sm:grid-cols-3">
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

        <Button type="submit" disabled={pending || !photo || cutting || !artwork || blocked}>
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
