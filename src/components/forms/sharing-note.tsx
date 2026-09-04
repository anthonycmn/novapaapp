"use client";

import { Info } from "lucide-react";
import { sharingReminder } from "@/lib/link-sharing";

/**
 * The reminder under a pasted link, for that link's own service.
 *
 * Tony, 2 Sep 2026: "if using a google link or dropbox link can a pop up
 * notification remind them how to set the viewing properly."
 *
 * Inline rather than an actual pop-up, and that is the point: it appears
 * underneath the box the moment the link goes in, stays there while they fix
 * it, and is still on screen when they come back from the other tab. A modal
 * would be dismissed in the half-second before anybody read it, and dismissing
 * it is the failure — a Drive file nobody shared looks completely fine from
 * this side of the screen.
 *
 * Nothing is blocked. A family who knows their link is right presses save and
 * this is a paragraph they scrolled past.
 *
 * Lives here rather than in the audition form because the headshot moved to a
 * link too (3 Sep), and two copies of this would drift.
 */
export function SharingNote({ url }: { url: string }) {
  const reminder = sharingReminder(url);
  if (!reminder) return null;
  return (
    <div
      role="status"
      className={
        reminder.tone === "warn"
          ? "gold-band flex items-start gap-2 rounded-lg border p-3"
          : "flex items-start gap-2 rounded-lg border bg-muted p-3"
      }
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{reminder.title}</p>
        <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4 text-[12.5px]">
          {reminder.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
