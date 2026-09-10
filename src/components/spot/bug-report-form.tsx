"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { submitBugReportAction } from "@/lib/actions/bug-report";
import {
  collectEnvironment,
  describeEnvironment,
  type BugEnvironment,
} from "@/lib/bug-report/environment";
import type { FamilyFormState } from "@/lib/actions/family";
import { FieldError } from "@/components/forms/field-error";

const initial: FamilyFormState = { ok: false };

/**
 * Reporting a bug from the page it happened on.
 *
 * Yin, a parent, 8 Sep 2026: "Create a bug report button ... When the user
 * reports the bug, it automatically catches the users' system environment such
 * as browser version, OS platform and version. The complexity of this is that
 * you also need to ask users to give you permission to collect such data."
 *
 * The permission is the form. Everything that will be sent is printed on it,
 * in the same words CJ will read, above the button that sends it — so there is
 * nothing to consent to that a parent has not already seen. That is why the
 * environment is shown as a plain block rather than summarized: a summary is a
 * promise about data, and the data itself is not a promise.
 *
 * Collected only once this panel is open. A parent who never reports a bug is
 * never measured.
 */
export function BugReportForm({ onDone }: { onDone: () => void }) {
  const [environment, setEnvironment] = useState<BugEnvironment | null>(null);
  const [state, formAction, pending] = useActionState(submitBugReportAction, initial);

  // In an effect, not in render: this reads window, and it must give the same
  // answer on the server (nothing) as on the first client paint.
  useEffect(() => setEnvironment(collectEnvironment()), []);

  if (state.ok) {
    return (
      <div className="space-y-3 p-3">
        <p className="flex items-start gap-2 text-[12.5px]">
          <CheckCircle2 aria-hidden size={15} className="mt-0.5 shrink-0 text-primary" />
          <span>
            Thank you — that went straight to CJ, with the details of your
            browser. He reads these himself.
          </span>
        </p>
        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-md border px-3 py-2 text-[12.5px] font-medium hover:bg-muted"
        >
          Back to Spot
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 p-3">
      <p className="text-[12.5px] text-muted-foreground">
        Tell us what went wrong in your own words. You do not need to know why
        it happened, and you do not need to say it neatly.
      </p>

      <div className="space-y-1">
        <label htmlFor="whatHappened" className="text-[12.5px] font-medium">
          What happened?
        </label>
        <textarea
          id="whatHappened"
          name="whatHappened"
          required
          maxLength={4000}
          rows={4}
          placeholder="For example: my daughter's name is missing from the week calendar — there's a dot but no name."
          className="w-full rounded-md border border-input bg-background p-2 text-[12.5px] placeholder:italic placeholder:text-muted-foreground/70"
        />
        <FieldError message={state.errors?.whatHappened} />
      </div>

      <div className="space-y-1">
        <label htmlFor="whatExpected" className="text-[12.5px] font-medium">
          What did you expect instead?{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="whatExpected"
          name="whatExpected"
          maxLength={4000}
          rows={2}
          className="w-full rounded-md border border-input bg-background p-2 text-[12.5px]"
        />
      </div>

      {/*
        Shown, not described. This is the consent: eight lines a parent can
        read in five seconds, and a Send button under them.
      */}
      <input type="hidden" name="environment" value={JSON.stringify(environment ?? {})} />
      <details className="rounded-md border bg-muted/40">
        <summary className="cursor-pointer px-2.5 py-2 text-[12px] font-medium">
          Sent with your report: which page, browser and device
        </summary>
        <pre className="overflow-x-auto px-2.5 pb-2.5 text-[11px] leading-relaxed text-muted-foreground">
          {environment ? describeEnvironment(environment) : "Reading your browser…"}
        </pre>
        <p className="px-2.5 pb-2.5 text-[11px] text-muted-foreground">
          Nothing else — no screenshot, and nothing about your child.
        </p>
      </details>

      <FieldError message={state.errors?._form} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border px-3 py-2 text-[12.5px] hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending && <Loader2 aria-hidden size={14} className="animate-spin" />}
          {pending ? "Sending…" : "Send to CJ"}
        </button>
      </div>
    </form>
  );
}
