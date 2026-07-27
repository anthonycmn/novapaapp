"use client";

import { useActionState, useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { deleteDocumentAction, uploadDocumentAction } from "@/lib/actions/materials";
import type { FamilyFormState } from "@/lib/actions/family";
import { DOCUMENT_CATEGORIES } from "@/lib/api/documents/types";
import type { Student } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/forms/field-error";

const initial: FamilyFormState = { ok: false };

export function DocumentUploadForm({
  familyId,
  students,
}: {
  familyId: string;
  students: Student[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dataUrl, setDataUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [state, formAction, pending] = useActionState(
    async (prev: FamilyFormState, formData: FormData) => {
      const result = await uploadDocumentAction(familyId, prev, formData);
      if (result.ok) {
        setDataUrl("");
        setFileName("");
      }
      return result;
    },
    initial
  );

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDataUrl(String(reader.result));
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="fileDataUrl" value={dataUrl} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="doc-name">Document name</Label>
        <Input
          id="doc-name"
          name="name"
          placeholder="Signed liability waiver 2026"
          required
          defaultValue={fileName.replace(/\.[^.]+$/, "")}
          key={fileName}
        />
        <FieldError message={state.errors?.name} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-category">Category</Label>
          <select
            id="doc-category"
            name="category"
            defaultValue="waiver"
            className="h-11 rounded-lg border border-input bg-card px-3 text-base"
          >
            {DOCUMENT_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-student">About (optional)</Label>
          <select
            id="doc-student"
            name="studentId"
            defaultValue=""
            className="h-11 rounded-lg border border-input bg-card px-3 text-base"
          >
            <option value="">The whole household</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.preferredName ?? student.firstName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <input
        ref={fileRef}
        id="doc-file"
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={onPick}
        className="sr-only"
      />
      <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
        <Upload aria-hidden />
        {fileName || "Choose a PDF or photo"}
      </Button>

      <FieldError message={state.errors?._form} />

      <Button type="submit" disabled={pending || !dataUrl}>
        {pending ? "Uploading…" : "Add to vault"}
      </Button>
      {state.ok && (
        <p role="status" className="text-sm font-medium text-primary">
          ✓ Saved to your vault.
        </p>
      )}
    </form>
  );
}

export function DeleteDocumentButton({
  documentId,
  name,
  disabled,
}: {
  documentId: string;
  name: string;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (disabled) return null;

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Delete ${name}`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 aria-hidden />
      </Button>
    );
  }

  return (
    <form action={deleteDocumentAction.bind(null, documentId)} className="flex gap-1">
      <Button type="submit" variant="destructive" size="sm">
        Delete
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </form>
  );
}
