"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  addFeeToCartAction,
  answerInviteAction,
  startActAction,
  withdrawActAction,
} from "@/lib/actions/performance";
import type { PerformerCandidate } from "@/lib/performance/types";

const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** "Sign up to perform": pick one of your own students, then the wizard. */
export function StartActForm({ eventId, candidates }: { eventId: string; candidates: PerformerCandidate[] }) {
  const router = useRouter();
  const eligible = candidates.filter((c) => c.eligible);
  const [studentId, setStudentId] = useState(eligible[0]?.studentId ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!eligible.length) return null;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          const r = await startActAction(eventId, studentId);
          if (!r.ok || !r.actId) return setError(r.message ?? "Could not start the sign-up.");
          router.push(`/family/events/${eventId}/act/${r.actId}?step=performer`);
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pe-student">Who is performing?</Label>
        <select id="pe-student" className={selectClass} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          {eligible.map((c) => (
            <option key={c.studentId} value={c.studentId}>
              {c.preferredName ?? c.legalName.split(" ")[0]} {c.legalName.split(" ").slice(1).join(" ")}
            </option>
          ))}
        </select>
        {candidates.length > eligible.length && (
          <p className="text-xs text-muted-foreground">
            {candidates.filter((c) => !c.eligible).map((c) => c.preferredName ?? c.legalName.split(" ")[0]).join(", ")}
            {" "}
            {candidates.length - eligible.length === 1 ? "is" : "are"} not eligible for this event.
          </p>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Duet or group? Start with one performer. You add the others, including students from another NOVAPA family, in step 3.
      </p>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" disabled={pending || !studentId}>
        {pending ? "Starting..." : "Sign up to perform"}
      </Button>
    </form>
  );
}

/** Another family invited one of ours: pick which student, or decline. */
export function InviteAnswer({
  performerId,
  eventId,
  candidates,
}: {
  performerId: string;
  eventId: string;
  candidates: PerformerCandidate[];
}) {
  const router = useRouter();
  const eligible = candidates.filter((c) => c.eligible);
  const [studentId, setStudentId] = useState(eligible[0]?.studentId ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const answer = (accept: boolean) =>
    start(async () => {
      setError("");
      const r = await answerInviteAction(performerId, accept, eventId, accept ? studentId : undefined);
      if (!r.ok) return setError(r.message ?? "That did not go through.");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2">
      {eligible.length ? (
        <>
          <Label htmlFor={`inv-${performerId}`}>Which of your students is performing?</Label>
          <select id={`inv-${performerId}`} className={selectClass} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            {eligible.map((c) => (
              <option key={c.studentId} value={c.studentId}>
                {c.preferredName ?? c.legalName}
              </option>
            ))}
          </select>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">None of your students is eligible for this event, so this invitation can only be declined.</p>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {eligible.length > 0 && (
          <Button type="button" disabled={pending} onClick={() => answer(true)}>
            Confirm
          </Button>
        )}
        <Button type="button" variant="outline" disabled={pending} onClick={() => answer(false)}>
          Decline
        </Button>
      </div>
    </div>
  );
}

export function WithdrawButton({ actId, eventId }: { actId: string; eventId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Withdraw
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Withdraw this act? It cannot be undone.</span>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await withdrawActAction(actId, eventId);
            if (!r.ok) return setError(r.message ?? "Could not withdraw.");
            setConfirming(false);
            router.refresh();
          })
        }
      >
        Yes, withdraw
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Keep it
      </Button>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}

export function PayFeeButton({ actId, label }: { actId: string; label: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await addFeeToCartAction(actId);
            if (!r.ok) return setError(r.message ?? "Could not add the fee.");
            router.push("/store/cart");
          })
        }
      >
        {label}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
