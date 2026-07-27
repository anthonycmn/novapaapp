"use client";

import { useActionState, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { addCatalogItemAction } from "@/lib/actions/store";
import type { FamilyFormState } from "@/lib/actions/family";
import { priceFor, type Product } from "@/lib/api/store/catalog";
import type { StaffProfile, Student } from "@/lib/api/types";
import { formatCents } from "@/lib/format";
import { readImageFile, ImageRejectedError } from "@/lib/platform/image-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";

const initial: FamilyFormState = { ok: false };

/**
 * One purchase form per product. Star pages collect a photo and message;
 * lessons collect a package, an optional teacher preference, and notes.
 */
export function CatalogItemForm({
  product,
  students,
  staff,
}: {
  product: Product;
  students: Student[];
  staff: StaffProfile[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [optionValue, setOptionValue] = useState(product.options[0]?.value ?? "");
  const [quantity, setQuantity] = useState(1);
  const [photo, setPhoto] = useState<{ dataUrl: string; width: number; height: number } | null>(
    null
  );
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [studentName, setStudentName] = useState(
    students[0] ? (students[0].preferredName ?? students[0].firstName) : ""
  );

  const [state, formAction, pending] = useActionState(addCatalogItemAction, initial);

  const unitPrice = priceFor(product, optionValue);
  const eligibleStaff = staff.filter((member) => product.staffIds?.includes(member.id));

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    try {
      const picked = await readImageFile(file);
      setPhoto({ dataUrl: picked.dataUrl, width: picked.width, height: picked.height });
    } catch (error) {
      setPhotoError(
        error instanceof ImageRejectedError ? error.message : "Could not read that photo."
      );
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="quantity" value={quantity} />
      <input type="hidden" name="photoDataUrl" value={photo?.dataUrl ?? ""} />
      <input type="hidden" name="photoWidth" value={photo?.width ?? 0} />
      <input type="hidden" name="photoHeight" value={photo?.height ?? 0} />

      {product.options.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`option-${product.id}`}>{product.optionLabel ?? "Option"}</Label>
          <select
            id={`option-${product.id}`}
            name="optionValue"
            value={optionValue}
            onChange={(event) => setOptionValue(event.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-base"
          >
            {product.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {formatCents(priceFor(product, option.value))}
                {option.description ? ` (${option.description})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`student-${product.id}`}>Student</Label>
        <Input
          id={`student-${product.id}`}
          name="studentName"
          value={studentName}
          onChange={(event) => setStudentName(event.target.value)}
          list={`students-${product.id}`}
          required
        />
        <datalist id={`students-${product.id}`}>
          {students.map((student) => (
            <option key={student.id} value={student.preferredName ?? student.firstName} />
          ))}
        </datalist>
        <FieldError message={state.errors?.studentName} />
      </div>

      {product.requiresPhoto && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`photo-${product.id}`}>Photo</Label>
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.dataUrl}
              alt="Chosen photo"
              className="h-32 w-32 rounded-lg border object-cover"
            />
          )}
          <input
            ref={fileRef}
            id={`photo-${product.id}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPick}
            className="sr-only"
          />
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => fileRef.current?.click()}
          >
            <Upload aria-hidden />
            {photo ? "Change photo" : "Choose a photo"}
          </Button>
          <FieldError message={photoError ?? state.errors?.photoDataUrl} />
        </div>
      )}

      {product.requiresMessage && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`message-${product.id}`}>
            {product.messageLabel ?? "Message"}
          </Label>
          <Textarea
            id={`message-${product.id}`}
            name="message"
            className="min-h-28"
            maxLength={product.messageMaxLength ?? 400}
            placeholder="We are so proud of you — break a leg!"
            required
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`signature-${product.id}`}>Signed</Label>
            <Input
              id={`signature-${product.id}`}
              name="signature"
              placeholder="Love, Mom and Dad"
              maxLength={80}
            />
          </div>
          <FieldError message={state.errors?.message} />
        </div>
      )}

      {product.type === "private_lesson" && (
        <>
          {eligibleStaff.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`staff-${product.id}`}>Teacher preference (optional)</Label>
              <select
                id={`staff-${product.id}`}
                name="preferredStaffId"
                defaultValue=""
                className="h-11 rounded-lg border border-input bg-card px-3 text-base"
              >
                <option value="">No preference</option>
                {eligibleStaff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`notes-${product.id}`}>
              Goals or scheduling notes (optional)
            </Label>
            <Textarea
              id={`notes-${product.id}`}
              name="notes"
              className="min-h-20"
              maxLength={600}
              placeholder="Preparing 'Let It Go' for the spring audition. Weekday evenings work best."
            />
          </div>
          <p className="text-sm text-muted-foreground">
            We&apos;ll email you to arrange times once the purchase is complete.
          </p>
        </>
      )}

      <div className="flex items-center gap-2">
        <Label htmlFor={`qty-${product.id}`} className="shrink-0">
          Quantity
        </Label>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Decrease quantity"
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
        >
          −
        </Button>
        <Input
          id={`qty-${product.id}`}
          value={quantity}
          onChange={(event) =>
            setQuantity(Math.min(20, Math.max(1, Number(event.target.value) || 1)))
          }
          inputMode="numeric"
          className="w-16 text-center"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Increase quantity"
          onClick={() => setQuantity((q) => Math.min(20, q + 1))}
        >
          +
        </Button>
        <p className="ml-auto font-semibold tabular-nums">
          {formatCents(unitPrice * quantity)}
        </p>
      </div>

      <FieldError message={state.errors?._form} />

      <Button
        type="submit"
        disabled={pending || (product.requiresPhoto && !photo)}
      >
        {pending ? "Adding…" : "Add to cart"}
      </Button>
      {state.ok && (
        <p role="status" className="text-sm font-medium text-primary">
          ✓ Added to your cart.
        </p>
      )}
    </form>
  );
}
