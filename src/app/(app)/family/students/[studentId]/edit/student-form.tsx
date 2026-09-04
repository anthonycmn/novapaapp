"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateStudentAction } from "@/lib/actions/student";
import type { FamilyFormState } from "@/lib/actions/family";
import type { Student, TShirtSize } from "@/lib/api/types";
import { Avatar } from "@/components/ui/avatar";
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

  // Age is derived, never stored: a stored age is wrong within a year.
  const age = student.dateOfBirth
    ? Math.floor((Date.now() - new Date(student.dateOfBirth).getTime()) / 31_557_600_000)
    : null;

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
      {/*
        The photo, which is no longer set here.

        There were two ways to put a face on a child — an upload on this form
        and the headshot link on the audition page — writing the same column, so
        whichever was saved last silently won and neither screen said so. Tony,
        3 Sep 2026: "yes remove the profile photo upload too." One place for it
        now; this shows what is there and where to change it.
      */}
      <div className="flex items-center gap-3">
        <Avatar
          name={`${student.firstName} ${student.lastName}`}
          src={student.headshotUrl}
          className="size-16 text-[15px]"
        />
        <p className="text-[12.5px] text-muted-foreground">
          {student.headshotUrl
            ? "This is the photo staff see. "
            : "No photo yet — it helps staff recognize your child at check-in. "}
          Set it as a link under{" "}
          <Link href="/auditions" className="text-primary underline-offset-4 hover:underline">
            Auditions
          </Link>
          , with the rest of their materials.
        </p>
      </div>

      {/* Legal name and birthday. These are the fields the registration system
          matches on, which is why they carry a warning the others do not. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firstName">Legal first name</Label>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={student.firstName}
            autoComplete="off"
            required
          />
          <FieldError message={state.errors?.firstName} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lastName">Legal last name</Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={student.lastName}
            autoComplete="off"
            required
          />
          <FieldError message={state.errors?.lastName} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            defaultValue={student.dateOfBirth?.slice(0, 10) ?? ""}
            required
          />
          <FieldError message={state.errors?.dateOfBirth} />
          {age !== null && (
            <p className="text-[11.5px] text-muted-foreground">
              Currently {age} years old — we work the age out from the birthday, so
              there is nothing else to keep up to date.
            </p>
          )}
        </div>
      </div>

      <p className="rounded-md border border-gold/40 bg-tip p-2.5 text-[12px] leading-relaxed text-tip-foreground">
        <strong>Use their legal name here.</strong> Registration matches your
        child to their classes by this name, so a nickname in these two boxes can
        detach them from their enrollment. Put what they like to be called in
        <em> preferred name</em> below — that is the name we use out loud, on the
        roster and in the program.
      </p>

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
