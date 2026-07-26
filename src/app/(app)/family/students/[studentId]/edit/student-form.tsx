"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { updateStudentAction } from "@/lib/actions/student";
import type { FamilyFormState } from "@/lib/actions/family";
import type { Student, TShirtSize } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";
import { UnsavedChangesGuard } from "@/components/forms/unsaved-changes-guard";

const SIZES: TShirtSize[] = ["YXS", "YS", "YM", "YL", "AS", "AM", "AL", "AXL"];
const initialState: FamilyFormState = { ok: false };

export function StudentForm({ student }: { student: Student }) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const boundAction = updateStudentAction.bind(null, student.id);
  const [state, formAction, pending] = useActionState(
    async (prev: FamilyFormState, formData: FormData) => {
      const result = await boundAction(prev, formData);
      if (result.ok) {
        setDirty(false);
        router.push(`/family/students/${student.id}`);
      }
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-4">
      <UnsavedChangesGuard dirty={dirty} />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="preferredName">Preferred name</Label>
          <Input id="preferredName" name="preferredName" defaultValue={student.preferredName ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pronouns">Pronouns (optional)</Label>
          <Input id="pronouns" name="pronouns" defaultValue={student.pronouns ?? ""} placeholder="she/her" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="grade">Grade</Label>
          <Input id="grade" name="grade" defaultValue={student.grade} required />
          <FieldError message={state.errors?.grade} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tshirtSize">T-shirt size</Label>
          <select
            id="tshirtSize"
            name="tshirtSize"
            defaultValue={student.tshirtSize ?? ""}
            className="h-11 rounded-lg border border-input bg-card px-3 text-base"
          >
            <option value="">—</option>
            {SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="school">School</Label>
        <Input id="school" name="school" defaultValue={student.school ?? ""} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="allergies">Allergies</Label>
        <Textarea
          id="allergies"
          name="allergies"
          defaultValue={student.allergies ?? ""}
          placeholder="e.g. Peanuts — EpiPen in bag"
          className="min-h-16"
        />
        <p className="text-xs text-muted-foreground">
          Visible to your family and NOVA PA staff only.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="medicalFlags">Medical notes</Label>
        <Textarea
          id="medicalFlags"
          name="medicalFlags"
          defaultValue={student.medicalFlags ?? ""}
          placeholder="e.g. Asthma — inhaler in backpack"
          className="min-h-16"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vocalRange">Vocal range</Label>
          <Input id="vocalRange" name="vocalRange" defaultValue={student.vocalRange ?? ""} placeholder="A3–D5" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auditionSongUrl">Audition song link</Label>
          <Input
            id="auditionSongUrl"
            name="auditionSongUrl"
            type="url"
            defaultValue={student.auditionSongUrl ?? ""}
            placeholder="YouTube / Drive / Dropbox"
            aria-invalid={!!state.errors?.auditionSongUrl}
          />
          <FieldError message={state.errors?.auditionSongUrl} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="danceExperience">Dance experience</Label>
        <Textarea
          id="danceExperience"
          name="danceExperience"
          defaultValue={student.danceExperience ?? ""}
          className="min-h-16"
        />
      </div>

      <FieldError message={state.errors?._form} />

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
