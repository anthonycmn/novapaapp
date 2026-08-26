"use client";

import { useActionState, useState } from "react";
import { claimVolunteerSlotAction, releaseVolunteerSlotAction } from "@/lib/actions/volunteers";
import type { FamilyFormState } from "@/lib/actions/family";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/forms/field-error";

const initial: FamilyFormState = { ok: false };

/**
 * Taking a slot, or giving it back.
 *
 * The name is asked for rather than assumed, because the person who signs up
 * is often not the person who turns up — a grandparent, an older sibling, the
 * other parent. It is pre-filled with the account name so the common case is
 * one tap.
 *
 * A refusal is shown as a sentence, not an error box. The one that will
 * actually happen is two parents taking the last place at the same moment, and
 * "somebody just took the last place on that one" is a fact about the world,
 * not a fault the parent made.
 */
export function SlotForm({
  slotId,
  placesLeft,
  mySignupId,
  defaultName,
}: {
  slotId: string;
  placesLeft: number;
  mySignupId: string | null;
  defaultName: string;
}) {
  const [open, setOpen] = useState(false);
  const [claimState, claim, claiming] = useActionState(claimVolunteerSlotAction, initial);
  const [releaseState, release, releasing] = useActionState(releaseVolunteerSlotAction, initial);

  if (mySignupId) {
    return (
      <form action={release} className="flex flex-col items-end gap-1">
        <input type="hidden" name="signupId" value={mySignupId} />
        <span className="text-sm font-medium text-emerald-700">You are on this one</span>
        <Button type="submit" variant="ghost" size="sm" disabled={releasing}>
          {releasing ? "…" : "Give it back"}
        </Button>
        <FieldError message={releaseState.errors?._form} />
      </form>
    );
  }

  if (placesLeft <= 0) {
    return <span className="text-sm text-muted-foreground">Full</span>;
  }

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Sign up
      </Button>
    );
  }

  return (
    <form action={claim} className="flex w-full max-w-xs flex-col gap-2">
      <input type="hidden" name="slotId" value={slotId} />
      <Input
        name="volunteerName"
        defaultValue={defaultName}
        placeholder="Who is coming"
        aria-label="Who is coming"
        required
      />
      <Input name="phone" placeholder="Phone (optional)" aria-label="Phone" />
      <Input name="note" placeholder="Anything we should know (optional)" aria-label="Note" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={claiming}>
          {claiming ? "Signing up…" : "Confirm"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <FieldError message={claimState.errors?._form} />
    </form>
  );
}
