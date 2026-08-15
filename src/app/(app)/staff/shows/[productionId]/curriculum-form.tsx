"use client";

import { useActionState } from "react";
import { saveCurriculum, type CurriculumFormState } from "@/lib/actions/curriculum";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Admin-only: upload a curriculum PDF or paste a link; publishes instantly. */
export function CurriculumForm({
  productionId,
  hasExisting,
}: {
  productionId: string;
  hasExisting: boolean;
}) {
  const [state, formAction, pending] = useActionState<CurriculumFormState, FormData>(
    saveCurriculum,
    { ok: false }
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-3">
      <input type="hidden" name="productionId" value={productionId} />
      <p className="text-sm font-medium">
        {hasExisting ? "Replace the curriculum" : "Publish the curriculum"}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="curriculum-file">Upload a PDF (or image)</Label>
        <Input
          id="curriculum-file"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="curriculum-url">…or paste a link</Label>
        <Input
          id="curriculum-url"
          name="url"
          type="url"
          placeholder="https://…"
          autoComplete="off"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm text-primary">
          Published — it&apos;s live on the show page.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Publishing…" : "Publish curriculum"}
      </Button>
    </form>
  );
}
