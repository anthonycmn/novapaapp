"use client";

import { useTransition } from "react";
import { Check, Undo2 } from "lucide-react";
import { setBugReportStatusAction } from "@/lib/actions/bug-report";
import type { BugReportStatus } from "@/lib/bug-report/types";

/**
 * Done with this one, or not after all.
 *
 * Two states and a way back, because the alternative is a list that only grows
 * and is therefore read once. Nothing is deleted: a report is somebody's
 * account of their evening, and a fixed bug that comes back is found by
 * searching for the first time it was reported.
 */
export function HandledButton({ id, status }: { id: string; status: BugReportStatus }) {
  const [pending, startTransition] = useTransition();
  const handled = status === "handled";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          void setBugReportStatusAction(id, handled ? "new" : "handled");
        })
      }
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
    >
      {handled ? (
        <>
          <Undo2 aria-hidden className="size-3.5" />
          Reopen
        </>
      ) : (
        <>
          <Check aria-hidden className="size-3.5" />
          Mark handled
        </>
      )}
    </button>
  );
}
