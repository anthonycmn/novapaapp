"use client";

import { useActionState } from "react";
import { Check, Clock, Hand } from "lucide-react";
import { markArrivedAction } from "@/lib/actions/pickup";
import type { SubmissionState } from "@/lib/actions/spirit-button";
import type { PickupRequest } from "@/lib/api/types";
import { formatDate, formatCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldError } from "@/components/forms/field-error";

const initialState: SubmissionState = { ok: false };

const KIND_LABEL: Record<PickupRequest["kind"], string> = {
  early_pickup: "Early pickup",
  late_dropoff: "Late drop-off",
  both: "Late drop-off & early pickup",
};

/**
 * One approved request, collapsed to the thing a parent needs at the kerb.
 *
 * Tony, 17 Aug 2026: "the form kinda collapses as this is the event, and then
 * they click a button that says I'm here."
 *
 * So once it is approved there is no form left — just the date, the time, and
 * one button. It is pressed one-handed, in a car, possibly in the rain, so it is
 * the biggest thing on the card and it says what happened afterwards rather than
 * going quiet.
 */
export function ArrivalCard({
  request,
  studentName,
  parentName,
}: {
  request: PickupRequest;
  studentName: string;
  parentName: string;
}) {
  // The action needs nothing from the form — only which request this is — so it
  // takes just the id rather than two arguments it would ignore.
  const [state, formAction, pending] = useActionState<SubmissionState, FormData>(
    () => markArrivedAction(request.id),
    initialState
  );

  const arrived = Boolean(request.arrivedAt) || state.ok;
  const when =
    request.kind === "late_dropoff"
      ? request.dropOffTime
      : (request.pickUpTime ?? request.dropOffTime);

  return (
    <div
      className={`rounded-lg border bg-card p-4 shadow-[var(--shadow-card)] ${
        arrived ? "border-primary/40" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold leading-snug">
            {studentName} · {KIND_LABEL[request.kind]}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden size={12} />
              {formatDate(`${request.startDate}T12:00:00Z`)}
              {request.endDate !== request.startDate &&
                ` – ${formatDate(`${request.endDate}T12:00:00Z`)}`}
            </span>
            {when && <span className="font-medium text-foreground">{when}</span>}
            {request.feeCents > 0 && <span>{formatCents(request.feeCents)}</span>}
          </p>
        </div>
        <Badge variant={arrived ? "gold" : "default"} className="shrink-0">
          {arrived ? "You're here" : "Approved"}
        </Badge>
      </div>

      {request.authorizedPickupPerson && (
        <p className="mt-1.5 text-[12px] text-muted-foreground">
          Collected by {request.authorizedPickupPerson}
        </p>
      )}

      {arrived ? (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-tip px-3 py-2 text-[13px] text-tip-foreground">
          <Check aria-hidden size={15} className="mt-0.5 shrink-0 text-gold" />
          <span>
            {state.message ??
              `We told the team${
                request.arrivedByName ? ` that ${request.arrivedByName} is here` : ""
              }. Someone is on their way.`}
          </span>
        </p>
      ) : (
        <form action={formAction} className="mt-3">
          {/* One-handed, in a car, possibly in the rain. */}
          <Button type="submit" disabled={pending} className="h-12 w-full text-[15px]">
            <Hand aria-hidden />
            {pending ? "Telling them…" : "I'm here"}
          </Button>
          <p className="mt-1.5 text-center text-[11.5px] text-muted-foreground">
            Tap when you pull up. This tells Health &amp; Safety and the Director of
            Education that {parentName.split(" ")[0]} is outside.
          </p>
          <FieldError message={state.errors?._form} />
        </form>
      )}
    </div>
  );
}
