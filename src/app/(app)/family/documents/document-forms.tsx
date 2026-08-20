"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteDocumentAction, uploadDocumentAction } from "@/lib/actions/materials";
import type { FamilyFormState } from "@/lib/actions/family";
import { DOCUMENT_CATEGORIES } from "@/lib/api/documents/types";
import type { Student } from "@/lib/api/types";
import { DirectUpload } from "@/components/forms/direct-upload";
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
  const [uploaded, setUploaded] = useState<{ fileName: string; path: string } | null>(null);
  // Bumped on a successful save so the picker is remounted empty: the document
  // has moved into the vault below, and leaving it attached here reads as
  // though it is about to be filed a second time.
  const [pickerKey, setPickerKey] = useState(0);
  const [state, formAction, pending] = useActionState(
    async (prev: FamilyFormState, formData: FormData) => {
      const result = await uploadDocumentAction(familyId, prev, formData);
      if (result.ok) {
        setUploaded(null);
        setPickerKey((current) => current + 1);
      }
      return result;
    },
    initial
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="doc-name">Document name</Label>
        <Input
          id="doc-name"
          name="name"
          placeholder="Signed liability waiver 2026"
          required
          defaultValue={uploaded?.fileName.replace(/\.[^.]+$/, "") ?? ""}
          key={uploaded?.path ?? "empty"}
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

      {/*
        * Straight to storage, not through the form post.
        *
        * A scan of a signed waiver is routinely well over the 6 MB request-body
        * cap a serverless function has, and base64 adds a third on top — which
        * is why every document upload used to fail with nothing on screen. The
        * signed URL takes the function out of the path, so the real limit is
        * the bucket's 20 MB.
        */}
      <DirectUpload
        key={pickerKey}
        name="fileUrl"
        pathName="filePath"
        bucket="family-documents"
        label="File"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        hint="A PDF or a photo of the form, up to 20 MB."
        onUploaded={setUploaded}
      />

      <FieldError message={state.errors?._form} />

      <Button type="submit" disabled={pending || !uploaded}>
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
