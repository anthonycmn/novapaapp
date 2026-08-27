import { ExternalLink, Footprints, Music4, Theater } from "lucide-react";
import type { Production } from "@/lib/api/types";

/**
 * Click tracks, choreography videos and staging — as tiles in the stat row.
 *
 * CJ, 26 Aug 2026, on the parent portal's Sweeney page: "I still don't see
 * the Click Tracks", then "I want a tile for each here, in the second row
 * next to Rehearsal Tracks so four tiles per row."
 *
 * They sit beside the rehearsal tracks tile because that is what they are to
 * a family: the material a performer opens at home between calls. Deliberately
 * the same size and shape as the numbers around them, since a student looking
 * for the choreography video is doing it on a phone in the ten minutes before
 * a lift home.
 *
 * NOT DRAWN WHEN EMPTY — which is the one place this differs from the staff
 * portal's version of the same three links. There, a folder nobody has filled
 * in is a grayed-out placeholder, because the person looking at it is the
 * person who can fix it. Here nobody can fix it, so an empty tile would only
 * be a parent emailing a director to ask about a button that does nothing.
 *
 * The links are read through to the staff portal (hub 0051), so a Director
 * pasting one in changes this page with no deploy and no sync.
 */

const TILES = [
  {
    key: "clickTracksUrl",
    label: "Click tracks",
    action: "Listen",
    Icon: Music4,
  },
  {
    key: "choreographyUrl",
    label: "Choreography",
    action: "Watch",
    Icon: Footprints,
  },
  {
    key: "stagingUrl",
    label: "Staging",
    action: "Watch",
    Icon: Theater,
  },
] as const;

export function ShowMediaTiles({ production }: { production: Production }) {
  return (
    <>
      {TILES.map(({ key, label, action, Icon }) => {
        const url = production[key];
        if (!url) return null;
        return (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-ring/40 hover:bg-muted/40"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-2xl font-semibold">
              <Icon aria-hidden size={20} className="shrink-0 text-gold" />
              {action}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
              Google Drive folder
              <ExternalLink aria-hidden size={10} />
              <span className="sr-only">(opens in a new tab)</span>
            </div>
          </a>
        );
      })}
    </>
  );
}
