"use client";

import { useActionState, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { submitAuditionProfileAction } from "@/lib/actions/auditions";
import type { FamilyFormState } from "@/lib/actions/family";
import {
  NO_GUARANTEE_TEXT,
  ROLE_KINDS,
  ROLE_TIERS,
  type AuditionProfile,
} from "@/lib/api/auditions/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/forms/field-error";
import { UnsavedChangesGuard } from "@/components/forms/unsaved-changes-guard";

const initial: FamilyFormState = { ok: false };

/**
 * Everything one performer is bringing to one show.
 *
 * This used to be split in two: hopes and a role preference here, and the
 * song, resume and recordings on the child's profile — carried unchanged from
 * show to show. That was wrong in both directions. A child prepares a
 * different song for Sweeney than for Frozen, and the panel reading a Sweeney
 * audition should be reading what was prepared for Sweeney.
 *
 * So it is one form per child per show, and everything on it is about THIS
 * show.
 *
 * The two videos are links a family pastes; only the resume is uploaded, and
 * it goes straight from the browser to storage because a file cannot travel
 * any other way on this host.
 */
export function AuditionForm({
  studentId,
  productionId,
  studentName,
  existing,
}: {
  studentId: string;
  productionId: string;
  studentName: string;
  existing: AuditionProfile | null;
}) {
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: FamilyFormState, formData: FormData) => {
      const result = await submitAuditionProfileAction(prev, formData);
      if (result.ok) setDirty(false);
      return result;
    },
    initial
  );

  return (
    <form action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-6">
      <UnsavedChangesGuard dirty={dirty} />
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="productionId" value={productionId} />

      {/* ── what to consider them for ───────────────────────────────────── */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">
          What should we consider {studentName} for?
        </legend>
        <p className="text-xs text-muted-foreground">
          Tick as many as apply — they are separate questions, and it is
          completely fine to tick none.
        </p>
        {ROLE_KINDS.map((kind) => (
          <label
            key={kind.field}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent"
          >
            <input
              type="checkbox"
              name={kind.field}
              defaultChecked={Boolean(existing?.[kind.field])}
              className="mt-1 size-4 accent-[var(--primary)]"
            />
            <span>
              <span className="block text-sm font-semibold">{kind.label}</span>
              <span className="block text-sm text-muted-foreground">{kind.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">
          And how big a part are they hoping for?
        </legend>
        {ROLE_TIERS.map((tier) => (
          <label
            key={tier.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent"
          >
            <input
              type="radio"
              name="preferenceTier"
              value={tier.value}
              defaultChecked={existing?.preferenceTier === tier.value}
              required
              className="mt-1 size-4 accent-[var(--primary)]"
            />
            <span>
              <span className="block text-sm font-semibold">{tier.label}</span>
              <span className="block text-sm text-muted-foreground">{tier.definition}</span>
            </span>
          </label>
        ))}
        <FieldError message={state.errors?.preferenceTier} />
      </fieldset>

      {/* ── the song ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm font-medium">Their audition song</p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="songTitle" className="text-[13px]">
            Song and show it&apos;s from
          </label>
          <Input
            id="songTitle"
            name="songTitle"
            defaultValue={existing?.songTitle ?? ""}
            maxLength={200}
            placeholder="Part of Your World — The Little Mermaid"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="songUrl" className="text-[13px]">
            Link to the track or sheet music (optional)
          </label>
          <Input
            id="songUrl"
            name="songUrl"
            type="url"
            defaultValue={existing?.songUrl ?? ""}
            maxLength={500}
            placeholder="https://…"
          />
          <FieldError message={state.errors?.songUrl} />
          <p className="text-xs text-muted-foreground">
            A YouTube, Drive or Dropbox link is fine.
          </p>
        </div>
      </div>

      {/* ── recordings (links) and the resume (still a file) ─────────────── */}
      <div className="flex flex-col gap-4 rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">Recordings and resume</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Only if you&apos;re auditioning by video, or you&apos;d like the
            team to have these. Nothing here is required.
          </p>
        </div>

        {/*
          Links, not uploads — Tony, 2 Sep 2026: "instead of uploading videos
          for singing and dance, provide a space for a URL."

          A self-tape off a phone is a several-hundred-megabyte file going up a
          home connection, and a family whose upload dies at 80% has no
          audition. The video is already in their phone's cloud — YouTube
          unlisted, Drive, Dropbox, iCloud — and pasting that link takes ten
          seconds and cannot fail halfway. It also leaves the family deciding
          who can watch their child sing, which is the right place for that.

          Anything already uploaded still works: those are https links too, so
          they appear in these boxes and the file route still signs them.
        */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="auditionVideoUrl" className="text-[13px] font-medium">
            Link to their singing video
          </label>
          <Input
            id="auditionVideoUrl"
            name="auditionVideoUrl"
            type="url"
            defaultValue={existing?.auditionVideoUrl ?? ""}
            maxLength={1000}
            placeholder="https://…"
          />
          <FieldError message={state.errors?.auditionVideoUrl} />
          <p className="text-xs text-muted-foreground">
            A self-tape, if they&apos;re auditioning by video rather than in the
            room. YouTube (unlisted is fine), Drive, Dropbox or iCloud —
            whatever you already use. Please check the link opens for somebody
            who is not signed in as you.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="danceVideoUrl" className="text-[13px] font-medium">
            Link to their dance video
          </label>
          <Input
            id="danceVideoUrl"
            name="danceVideoUrl"
            type="url"
            defaultValue={existing?.danceVideoUrl ?? ""}
            maxLength={1000}
            placeholder="https://…"
          />
          <FieldError message={state.errors?.danceVideoUrl} />
          <p className="text-xs text-muted-foreground">
            A separate clip if they&apos;d like their dancing seen.
          </p>
        </div>

        {/* The resume followed the videos (Tony, same day). One rule for the
            whole block is easier to explain than "two of these are links and
            the third is a file", and a resume is a Drive or Dropbox PDF in most
            households anyway. */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="resumeUrl" className="text-[13px] font-medium">
            Link to their resume
          </label>
          <Input
            id="resumeUrl"
            name="resumeUrl"
            type="url"
            defaultValue={existing?.resumeUrl ?? ""}
            maxLength={1000}
            placeholder="https://…"
          />
          <FieldError message={state.errors?.resumeUrl} />
          <p className="text-xs text-muted-foreground">
            A PDF in Drive, Dropbox or iCloud. Same again: check it opens for
            somebody who is not signed in as you.
          </p>
        </div>
      </div>

      {/* ── the words ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="hopes" className="text-sm font-medium">
          What is {studentName} hoping to get out of this show?
        </label>
        <Textarea
          id="hopes"
          name="hopes"
          defaultValue={existing?.hopes ?? ""}
          placeholder="Growing confidence, making friends, trying a bigger part…"
          className="min-h-28"
          maxLength={2000}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="previousRoles" className="text-sm font-medium">
          Previous roles (optional)
        </label>
        <Textarea
          id="previousRoles"
          name="previousRoles"
          defaultValue={existing?.previousRoles ?? ""}
          placeholder={"Young Anna — Frozen Jr. (2025)\nEnsemble — Annie Jr. (2024)"}
          className="min-h-24"
          maxLength={2000}
        />
        <p className="text-xs text-muted-foreground">
          Shows with us are already on file — this is for anything else.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-sm font-medium">
          Anything else the team should know? (optional)
        </label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={existing?.notes ?? ""}
          placeholder="A conflict during tech week, an injury, a name they'd rather be called in the room…"
          className="min-h-24"
          maxLength={2000}
        />
      </div>

      <div className="gold-band rounded-lg border p-4">
        <p className="flex items-start gap-2 text-sm font-medium">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          Please read before submitting
        </p>
        <p className="mt-2 text-sm">{NO_GUARANTEE_TEXT}</p>
        <label className="mt-3 flex min-h-11 items-start gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="acknowledged"
            defaultChecked={Boolean(existing)}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          We understand — sharing a preference does not guarantee any specific
          part or size of role.
        </label>
        <FieldError message={state.errors?.acknowledged} />
      </div>

      <FieldError message={state.errors?._form} />

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : existing ? "Update audition" : "Submit audition"}
        </Button>
        {state.ok && (
          <p role="status" className="text-sm font-medium text-primary">
            Saved ✓
          </p>
        )}
      </div>
    </form>
  );
}
