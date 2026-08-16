import { ChevronRight, ExternalLink, Music } from "lucide-react";
import { SWEENEY_REHEARSAL_TRACKS } from "@/config/shows/sweeney-todd";
import { Card } from "@/components/ui/card";

/**
 * MTI rehearsal tracks.
 *
 * The code is the whole point of this card, so the code IS the card. The
 * install instructions used to take a full screen of three side-by-side
 * columns — reference a family reads once, sitting above the things they
 * check weekly. They are behind a disclosure now.
 *
 * Rendered from a server component inside the signed-in portal, so the code
 * never reaches an anonymous visitor or the client bundle. Students see it
 * too: 13 is the age a student gets their own account, so having an account
 * IS the age check.
 */
export function RehearsalTracks() {
  const { code, streamingUrl, options } = SWEENEY_REHEARSAL_TRACKS;

  return (
    // The top-of-page tracks card jumps here. scroll-mt keeps the heading
    // clear of the sticky app bar instead of tucked underneath it.
    <Card pad={false} id="rehearsal-tracks" className="scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <Music aria-hidden size={17} className="shrink-0 text-gold" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
              Rehearsal code
            </p>
            <p className="font-mono text-[19px] font-semibold leading-tight tracking-[0.08em]">
              {code}
            </p>
          </div>
        </div>
        <a
          href={streamingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Play in a browser
          <ExternalLink aria-hidden size={12} />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>

      <details className="group border-t">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2 text-[12.5px] text-muted-foreground hover:text-foreground">
          <ChevronRight
            aria-hidden
            size={13}
            className="shrink-0 transition-transform group-open:rotate-90"
          />
          How to get the tracks on a phone
        </summary>
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
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
