import { ChevronRight, ExternalLink } from "lucide-react";
import { SWEENEY_REHEARSAL_TRACKS } from "@/config/shows/sweeney-todd";
import { Card } from "@/components/ui/card";

/**
 * MTI rehearsal tracks.
 *
 * Tony, 17 Aug 2026: "Move the Rehearsal Tracks Information to the top as a
 * 5th tile." So the code and the play button now sit in the stat row with the
 * other four numbers — it is the thing students reach for daily, and it was
 * three scrolls down.
 *
 * Rendered from a server component inside the signed-in portal, so the code
 * never reaches an anonymous visitor or the client bundle. Students see it
 * too: 13 is the age a student gets their own account, so having an account
 * IS the age check.
 */
export function RehearsalTracksTile() {
  const { code, streamingUrl } = SWEENEY_REHEARSAL_TRACKS;

  return (
    <div className="rounded-lg border bg-card p-4 text-left shadow-[var(--shadow-card)]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Rehearsal tracks
      </div>
      <div className="mt-1 font-mono text-[19px] font-semibold leading-tight tracking-[0.06em]">
        {code}
      </div>
      <a
        href={streamingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-primary underline-offset-4 hover:underline"
      >
        Play in a browser
        <ExternalLink aria-hidden size={11} />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}

/**
 * The install instructions that used to sit above this card's own code. They
 * are reference a family reads once, so they stay collapsed — but they stay,
 * because "how do I get these onto a phone" is a real question and the tile
 * has no room for the answer.
 */
export function RehearsalTracksHelp() {
  const { options } = SWEENEY_REHEARSAL_TRACKS;

  return (
    <Card pad={false} id="rehearsal-tracks" className="scroll-mt-20">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-[12.5px] text-muted-foreground hover:text-foreground">
          <ChevronRight
            aria-hidden
            size={13}
            className="shrink-0 transition-transform group-open:rotate-90"
          />
          How to get the rehearsal tracks onto a phone
        </summary>
        <div className="grid gap-3 border-t px-4 py-4 sm:grid-cols-3">
          {options.map((option) => (
            <div key={option.platform} className="rounded-md border p-3">
              <h3 className="text-[12.5px] font-semibold">{option.platform}</h3>
              <ol className="mt-1 flex list-decimal flex-col gap-0.5 pl-4 text-[12px] leading-snug text-muted-foreground">
                {option.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ))}
          <p className="text-[11.5px] leading-relaxed text-muted-foreground sm:col-span-3">
            Download before rehearsal — the wifi will not carry twenty devices.
            Students aged 13 and over can sign in with their own account;
            younger performers should use a parent&apos;s device. The code is
            licensed to our company for this production, so please keep it
            inside the cast and their families.
          </p>
        </div>
      </details>
    </Card>
  );
}
