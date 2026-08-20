"use client";

import { useActionState, useState } from "react";
import { FileText, Music, Trash2 } from "lucide-react";
import {
  clearAuditionAudioAction,
  saveAuditionAudioAction,
  saveHeadshotAction,
  saveResumeCreditsAction,
  saveResumePdfAction,
} from "@/lib/actions/materials";
import type { FamilyFormState } from "@/lib/actions/family";
import type { ResumeCredit, Student } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DirectUpload } from "@/components/forms/direct-upload";
import { FieldError } from "@/components/forms/field-error";
import { HeadshotCropper, type HeadshotResult } from "@/components/media/headshot-cropper";

const initial: FamilyFormState = { ok: false };



/* ── headshot ───────────────────────────────────────────────────────────── */

export function HeadshotSection({ student }: { student: Student }) {
  const [cropped, setCropped] = useState<HeadshotResult | null>(null);
  const bound = saveHeadshotAction.bind(null, student.id);
  const [state, formAction, pending] = useActionState(bound, initial);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="webDataUrl" value={cropped?.webDataUrl ?? ""} />
      <input type="hidden" name="printDataUrl" value={cropped?.printDataUrl ?? ""} />

      <HeadshotCropper
        currentUrl={student.headshotUrl}
        onCropped={setCropped}
        disabled={pending}
      />

      {cropped && (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cropped.webDataUrl}
            alt="Cropped headshot preview"
            className="h-24 w-[77px] rounded-lg border object-cover"
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save headshot"}
          </Button>
        </div>
      )}

      <FieldError message={state.errors?._form} />
      {state.ok && (
        <p role="status" className="text-sm font-medium text-primary">
          ✓ Headshot saved — web and print versions generated.
        </p>
      )}
    </form>
  );
}

/* ── audition audio ─────────────────────────────────────────────────────── */

export function AuditionAudioSection({ student }: { student: Student }) {
  const [uploaded, setUploaded] = useState<{ fileName: string; path: string } | null>(null);

  const bound = saveAuditionAudioAction.bind(null, student.id);
  const [state, formAction, pending] = useActionState(bound, initial);

  return (
    <div className="flex flex-col gap-3">
      {student.auditionAudioUrl && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Music aria-hidden className="size-4" />
            Current recording
          </p>
          <audio controls src={student.auditionAudioUrl} className="w-full">
            Your browser can&apos;t play audio. Download the file instead.
          </audio>
          <form action={clearAuditionAudioAction.bind(null, student.id)}>
            <Button type="submit" variant="ghost" size="sm">
              <Trash2 aria-hidden />
              Remove recording
            </Button>
          </form>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-2">
        {/* Straight to storage: a recording will not fit a form post. */}
        <DirectUpload
          name="audioUrl"
          pathName="audioPath"
          bucket="audition-audio"
          studentId={student.id}
          label={student.auditionAudioUrl ? "Replace recording" : "Upload a recording"}
          accept="audio/mpeg,audio/mp4,audio/wav,audio/x-m4a,audio/webm,audio/ogg"
          hint="An MP3 or a phone voice memo, up to 10 MB."
          onUploaded={setUploaded}
        />
        <FieldError message={state.errors?._form} />
        {uploaded && (
          <Button type="submit" disabled={pending}>
            {pending ? "Uploading…" : "Save recording"}
          </Button>
        )}
        {state.ok && (
          <p role="status" className="text-sm font-medium text-primary">
            ✓ Recording saved.
          </p>
        )}
      </form>
    </div>
  );
}

/* ── resume PDF ─────────────────────────────────────────────────────────── */

export function ResumePdfSection({ student }: { student: Student }) {
  const [uploaded, setUploaded] = useState<{ fileName: string; path: string } | null>(null);
  const bound = saveResumePdfAction.bind(null, student.id);
  const [state, formAction, pending] = useActionState(bound, initial);

  return (
    <form action={formAction} className="flex flex-col gap-2">

      {student.resumePdfUrl && (
        <a
          href={student.resumePdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <FileText aria-hidden className="size-4" />
          View uploaded resume PDF
        </a>
      )}
      {/* Straight to storage: a scanned resume is well over the body cap. */}
      <DirectUpload
        name="resumePdfUrl"
        pathName="resumePdfPath"
        bucket="resumes"
        studentId={student.id}
        label={student.resumePdfUrl ? "Replace PDF" : "Upload a PDF resume"}
        accept="application/pdf"
        hint="PDF, up to 10 MB."
        onUploaded={setUploaded}
      />
      <FieldError message={state.errors?._form} />
      {uploaded && (
        <Button type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Save PDF"}
        </Button>
      )}
      {state.ok && (
        <p role="status" className="text-sm font-medium text-primary">
          ✓ Resume PDF saved.
        </p>
      )}
    </form>
  );
}

/* ── structured resume builder ──────────────────────────────────────────── */

const CATEGORY_LABEL: Record<ResumeCredit["category"], string> = {
  role: "Role",
  training: "Training",
  special_skill: "Special skill",
};

export function ResumeBuilder({
  student,
  suggested,
}: {
  student: Student;
  suggested: ResumeCredit[];
}) {
  const [rows, setRows] = useState<ResumeCredit[]>(student.resumeCredits ?? []);
  const bound = saveResumeCreditsAction.bind(null, student.id);
  const [state, formAction, pending] = useActionState(bound, initial);

  function update(index: number, patch: Partial<ResumeCredit>) {
    setRows((current) =>
      current.map((row, position) => (position === index ? { ...row, ...patch } : row))
    );
  }

  function add(category: ResumeCredit["category"]) {
    setRows((current) => [
      ...current,
      { id: `new-${current.length}`, category, title: "" },
    ]);
  }

  // Show-history credits the resume doesn't already list.
  const missing = suggested.filter(
    (candidate) =>
      !rows.some((row) => row.title.toLowerCase() === candidate.title.toLowerCase())
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Ids are regenerated server-side, so only the content travels. */}
      <input
        type="hidden"
        name="credits"
        value={JSON.stringify(
          rows.map((row) => ({
            category: row.category,
            title: row.title,
            organization: row.organization,
            year: row.year,
            notes: row.notes,
          }))
        )}
      />

      {missing.length > 0 && (
        <div className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
          <p className="font-medium">
            {missing.length} show{missing.length === 1 ? "" : "s"} from{" "}
            {student.preferredName ?? student.firstName}&apos;s history{" "}
            {missing.length === 1 ? "isn't" : "aren't"} on the resume yet.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => setRows((current) => [...current, ...missing])}
          >
            Add {missing.length === 1 ? "it" : "them all"}
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing on the resume yet. Add a role, training, or a special skill.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <li key={index} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABEL[row.category]}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${row.title || "this row"}`}
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`title-${index}`} className="text-xs">
                    {row.category === "role"
                      ? "Role and show"
                      : row.category === "training"
                        ? "What and how long"
                        : "Skill"}
                  </Label>
                  <Input
                    id={`title-${index}`}
                    value={row.title}
                    onChange={(event) => update(index, { title: event.target.value })}
                    placeholder={
                      row.category === "role"
                        ? "Young Elsa — Frozen Jr."
                        : row.category === "training"
                          ? "Ballet — 3 years"
                          : "Juggling"
                    }
                    required
                  />
                </div>
                {row.category !== "special_skill" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={row.organization ?? ""}
                      onChange={(event) => update(index, { organization: event.target.value })}
                      placeholder="Organization"
                      aria-label="Organization"
                    />
                    <Input
                      value={row.year ?? ""}
                      onChange={(event) => update(index, { year: event.target.value })}
                      placeholder="Year"
                      aria-label="Year"
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => add("role")}>
          + Role
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => add("training")}>
          + Training
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => add("special_skill")}>
          + Special skill
        </Button>
      </div>

      <FieldError message={state.errors?._form} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save resume"}
        </Button>
        {state.ok && (
          <p role="status" className="text-sm text-muted-foreground">
            Saved ✓
          </p>
        )}
      </div>
    </form>
  );
}

/* ── vocal range / dance, which print on the resume ─────────────────────── */

export function PerformerDetails({ student }: { student: Student }) {
  return (
    <div className="grid gap-2 text-sm sm:grid-cols-2">
      <div>
        <p className="text-muted-foreground">Vocal range</p>
        <p>{student.vocalRange || "—"}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Dance experience</p>
        <p>{student.danceExperience || "—"}</p>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Edit these on the profile page — they print at the top of the resume.
      </p>
    </div>
  );
}

export { Textarea };
