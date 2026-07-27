"use client";

import { useActionState, useState } from "react";
import { startThreadAction } from "@/lib/actions/messages";
import type { FamilyFormState } from "@/lib/actions/family";
import { RECIPIENT_ROLES } from "@/lib/api/messages/types";
import type { Student } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";
import { UnsavedChangesGuard } from "@/components/forms/unsaved-changes-guard";

const initial: FamilyFormState = { ok: false };

export function NewThreadForm({ students }: { students: Student[] }) {
  const [role, setRole] = useState<string>("admin");
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(startThreadAction, initial);

  const selected = RECIPIENT_ROLES.find((entry) => entry.value === role);

  return (
    <form action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-4">
      <UnsavedChangesGuard dirty={dirty} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Who should see this?</legend>
        {RECIPIENT_ROLES.map((entry) => (
          <label
            key={entry.value}
            className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent"
          >
            <input
              type="radio"
              name="recipientRole"
              value={entry.value}
              checked={role === entry.value}
              onChange={() => setRole(entry.value)}
              className="mt-1 size-4 accent-[var(--primary)]"
            />
            <span>
              <span className="block text-sm font-medium">{entry.label}</span>
              <span className="block text-xs text-muted-foreground">
                {entry.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {selected?.value === "health_safety" && (
        <p className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
          This reaches the Director of Health &amp; Safety and the administrators
          — not the whole staff. For anything urgent happening right now, please
          phone the studio rather than message.
        </p>
      )}

      {students.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="studentId">About which child? (optional)</Label>
          <select
            id="studentId"
            name="studentId"
            defaultValue=""
            className="h-11 rounded-lg border border-input bg-card px-3 text-base"
          >
            <option value="">Not about one child</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.preferredName ?? student.firstName} {student.lastName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" maxLength={150} required />
        <FieldError message={state.errors?.subject} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="body">Message</Label>
        <Textarea id="body" name="body" className="min-h-40" maxLength={5000} required />
        <FieldError message={state.errors?.body} />
      </div>

      <FieldError message={state.errors?._form} />

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
