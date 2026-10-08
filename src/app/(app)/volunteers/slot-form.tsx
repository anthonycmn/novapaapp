"use client";

import { useActionState, useState } from "react";
import {
  claimVolunteerSlotAction,
  moveVolunteerSlotAction,
  releaseVolunteerSlotAction,
} from "@/lib/actions/volunteers";
import type { FamilyFormState } from "@/lib/actions/family";
import type { VolunteerSlot } from "@/lib/api/types";
import { insideTwentyFourHours } from "@/config/volunteer-kinds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/forms/field-error";

const initial: FamilyFormState = { ok: false };

/**
 * Taking a slot, moving it, or giving it back.
 *
 * The name is asked for rather than assumed, because the person who signs up
 * is often not the person who turns up — a grandparent, an older sibling, the
 * other parent. It is pre-filled with the account name so the common case is
 * one tap.
 *
 * THE BADGE is opt-in: a box to tick, and the name to print (defaults to the
 * volunteer's name). Nothing is printed for somebody who did not tick it.
 *
 * Inside 24 hours the reschedule and give-back buttons are replaced by the
 * address to write to. The database refuses either way; this is so a parent
 * is told before they press, not after.
 *
 * A refusal is shown as a sentence, not an error box. The one that will
 * actually happen is two parents taking the last place at the same moment.
 */
export function SlotForm({
  slotId,
  kindAsksBringing,
  placesLeft,
  countsFrom,
  mine,
  moveTargets,
  defaultName,
  helpEmail,
}: {
  slotId: string;
  kindAsksBringing: boolean;
  placesLeft: number;
  countsFrom: string | null;
  mine: VolunteerSlot["mine"];
  moveTargets: Array<{ id: string; label: string; countsFrom: string | null }>;
  defaultName: string;
  helpEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [badge, setBadge] = useState(false);
  const [claimState, claim, claiming] = useActionState(claimVolunteerSlotAction, initial);
  const [releaseState, release, releasing] = useActionState(releaseVolunteerSlotAction, initial);
  const [moveState, move, moveBusy] = useActionState(moveVolunteerSlotAction, initial);
  // Worked out on the server and again in the browser; a minute either side
  // of the line does not matter, because the database is what decides.
  const locked = insideTwentyFourHours(countsFrom);
  const passed = countsFrom ? new Date(countsFrom).getTime() <= Date.now() : false;

  if (mine) {
    const targets = moveTargets.filter((t) => !insideTwentyFourHours(t.countsFrom));
    return (
      <div className="flex w-full max-w-xs flex-col items-end gap-1">
        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
          You are on this one
        </span>
        {locked ? (
          <span className="text-right text-xs text-muted-foreground">
            Less than 24 hours to go — to change it, email{" "}
            <a className="underline" href={`mailto:${helpEmail}`}>
              {helpEmail}
            </a>
            .
          </span>
        ) : moving ? (
          <form action={move} className="flex w-full flex-col gap-2">
            <input type="hidden" name="signupId" value={mine.signupId} />
            <select
              name="toSlotId"
              required
              aria-label="Move to"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                Move to…
              </option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button type="submit" size="sm" disabled={moveBusy}>
                {moveBusy ? "Moving…" : "Move"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setMoving(false)}>
                Cancel
              </Button>
            </div>
            <FieldError message={moveState.errors?._form} />
          </form>
        ) : (
          <div className="flex gap-1">
            {targets.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setMoving(true)}>
                Reschedule
              </Button>
            )}
            <form action={release}>
              <input type="hidden" name="signupId" value={mine.signupId} />
              <Button type="submit" variant="ghost" size="sm" disabled={releasing}>
                {releasing ? "…" : "Give it back"}
              </Button>
            </form>
          </div>
        )}
        <FieldError message={releaseState.errors?._form} />
      </div>
    );
  }

  if (passed) {
    return <span className="text-sm text-muted-foreground">Closed</span>;
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
      {kindAsksBringing && (
        <Input
          name="bringing"
          placeholder="What you're bringing (everyone sees this)"
          aria-label="What you're bringing"
          required
        />
      )}
      <Input name="phone" placeholder="Phone (optional)" aria-label="Phone" />
      <Input name="note" placeholder="Anything we should know (optional)" aria-label="Note" />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="badgeOk"
          className="mt-1"
          checked={badge}
          onChange={(e) => setBadge(e.target.checked)}
        />
        <span>Print my name on a volunteer badge</span>
      </label>
      {badge && (
        <Input
          name="badgeName"
          placeholder="Name for the badge (blank = the name above)"
          aria-label="Name for the badge"
          maxLength={40}
        />
      )}
      {locked && (
        <p className="text-xs text-muted-foreground">
          This starts within 24 hours, so once you sign up you will need to email {helpEmail} to
          change it.
        </p>
      )}
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
