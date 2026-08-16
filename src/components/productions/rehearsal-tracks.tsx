import { ExternalLink, Music } from "lucide-react";
import { SWEENEY_REHEARSAL_TRACKS } from "@/config/shows/sweeney-todd";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * MTI rehearsal tracks.
 *
 * Rendered from a server component inside the signed-in portal, so the code
 * never reaches an anonymous visitor or the client bundle. Parents and
 * students both see it — Tony, 16 Aug 2026: students may use it provided they
 * are 13 or over, which is exactly the age at which a student gets their own
 * portal account, so having an account IS the age check.
 */
export function RehearsalTracks() {
  const { code, streamingUrl, options } = SWEENEY_REHEARSAL_TRACKS;

  return (
    <Card pad={false}>
      <SectionHeader
        title="Rehearsal tracks"
        inCard
        right={
          <a
            href={streamingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Music aria-hidden size={14} />
            Stream in a browser
            <ExternalLink aria-hidden size={12} />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        }
      />

      <div className="p-4">
        <div className="rounded-md border border-gold/40 bg-tip px-4 py-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gold">
            Rehearsal code
          </p>
          <p className="mt-0.5 font-mono text-[20px] font-semibold tracking-[0.08em] text-tip-foreground">
            {code}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-tip-foreground/80">
            The same code works everywhere below. It is licensed to our company
            for this production — please keep it inside the cast and their
            families.
          </p>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {options.map((option) => (
            <div key={option.platform} className="rounded-md border p-3">
              <h3 className="text-[13px] font-semibold">{option.platform}</h3>
              <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-4 text-[12.5px] leading-snug text-muted-foreground">
                {option.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="mt-2 text-[11.5px] italic leading-snug text-muted-foreground">
                {option.note}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[12px] text-muted-foreground">
          Students aged 13 and over can sign in with their own account and use
          these too. Younger performers should use a parent&apos;s device.
        </p>
      </div>
    </Card>
  );
}
