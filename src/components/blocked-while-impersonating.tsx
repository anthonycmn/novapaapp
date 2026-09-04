"use client";

import { useState, useTransition } from "react";
import { Lock, Mail } from "lucide-react";
import { askTheParentAction } from "@/lib/actions/impersonation";
import { Button } from "@/components/ui/button";

/**
 * Shown in place of one of the four forms a Chief may not submit for a family.
 *
 * It says why rather than just refusing. "You cannot do this" invites a second
 * attempt and a phone call; "this one has to be them, here is a link that will
 * take them ten seconds" ends the conversation with the thing actually getting
 * done.
 *
 * The button sends to the address on the account and nowhere else — see
 * askTheParentAction. Nothing here chooses a recipient.
 */

const WHY: Record<string, string> = {
  document:
    "Uploading and removing a family's own documents stays with them — a record that appears in their file should be one they put there.",
  pickup:
    "Who may collect a child is theirs to say. A change here has to be traceable to the parent who asked for it, not to whoever took the call.",
  health:
    "The health form is signed. It is a parent's own statement about their child's allergies and medication, and staff standing in for that signature is how a form stops meaning anything.",
  store: "Buying something spends their money, on their saved card.",
};

export function BlockedWhileImpersonating({
  action,
  title,
}: {
  action: "document" | "pickup" | "health" | "store";
  /** What they were trying to do, in the page's own words. */
  title: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-sm dark:bg-amber-950/40">
      <p className="flex items-center gap-2 font-semibold text-amber-950 dark:text-amber-100">
        <Lock aria-hidden size={15} className="shrink-0" />
        {title} has to be done by the family
      </p>
      <p className="mt-1.5 text-amber-900 dark:text-amber-200/90">{WHY[action]}</p>

      {result ? (
        <p
          className={`mt-3 font-medium ${
            result.ok
              ? "text-emerald-800 dark:text-emerald-300"
              : "text-rose-800 dark:text-rose-300"
          }`}
        >
          {result.message}
        </p>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={pending}
          onClick={() =>
            startTransition(async () => setResult(await askTheParentAction(action)))
          }
        >
          <Mail aria-hidden size={14} />
          {pending ? "Sending…" : "Email them a link to do it"}
        </Button>
      )}
    </div>
  );
}
