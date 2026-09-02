"use client";

import { useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { withdrawAbsenceAction } from "@/lib/actions/absence";
import { Button } from "@/components/ui/button";

/**
 * "Actually, never mind."
 *
 * Tony, 2 Sep 2026: "allow parents to adjust their own child's conflicts."
 *
 * Two taps, not one. A conflict is what a director plans a rehearsal around,
 * and an accidental tap that silently un-tells them is worse than no button —
 * so the first press asks and the second does it. It is not a modal, because
 * this is a row in a list and a dialog over one row to confirm one word is
 * more ceremony than the decision deserves.
 */
export function WithdrawButton({ reportId, who }: { reportId: string; who: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!asking) {
    return (
      <div className="mt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-2 py-1 text-[12px] text-muted-foreground"
          onClick={() => setAsking(true)}
        >
          <Undo2 aria-hidden className="mr-1 size-3.5" />
          Withdraw
        </Button>
        {error && <p className="mt-1 text-[12px] text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <p className="text-[12px] text-muted-foreground">
        Withdraw this — {who} will be expected as normal?
      </p>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className="h-auto px-2.5 py-1 text-[12px]"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await withdrawAbsenceAction(reportId);
            if (!result.ok) {
              setError(result.message ?? "That did not withdraw.");
              setAsking(false);
            }
          })
        }
      >
        {pending ? "Withdrawing…" : "Yes, withdraw"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-auto px-2.5 py-1 text-[12px]"
        disabled={pending}
        onClick={() => setAsking(false)}
      >
        Keep it
      </Button>
    </div>
  );
}
