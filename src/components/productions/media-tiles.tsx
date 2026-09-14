import { ExternalLink, FileText, Headphones, Link2, Video } from "lucide-react";
import type { Production, ProductionMaterialKind } from "@/lib/api/types";

/**
 * What a performer rehearses from at home — as tiles in the stat row.
 *
 * CJ, 26 Aug 2026, on the parent portal's Sweeney page: "I still don't see
 * the Click Tracks", then "I want a tile for each here, in the second row
 * next to Rehearsal Tracks so four tiles per row." Then 14 Sep, with the
 * Frozen KIDS kit: guide vocals, performance tracks, the actor's script,
 * choreography and staging videos — and a note on the script, that every
 * performer gets a printed copy and this one is for the night it gets left
 * behind.
 *
 * So the tiles are no longer three fixed folders. The show carries a list
 * (staff 0312, read through by hub 0087) and this draws whatever is on it,
 * in the Director's order, under the Director's labels. The four staff-only
 * documents in that kit never reach this component: the view filters on
 * audience, so there is nothing here to hide.
 *
 * They sit beside the rehearsal tracks tile because that is what they are to
 * a family: the material a performer opens at home between calls. Deliberately
 * the same size and shape as the numbers around them, since a student looking
 * for the choreography video is doing it on a phone in the ten minutes before
 * a lift home.
 *
 * NOT DRAWN WHEN EMPTY — which is the one place this differs from the staff
 * portal's version of the same list. There, an editor gets an "Add a link"
 * tile, because the person looking at it is the person who can fix it. Here
 * nobody can fix it, so an empty tile would only be a parent emailing a
 * director to ask about a button that does nothing.
 */

const KIND: Record<
  ProductionMaterialKind,
  { Icon: typeof Headphones; action: string }
> = {
  audio: { Icon: Headphones, action: "Listen" },
  video: { Icon: Video, action: "Watch" },
  document: { Icon: FileText, action: "Read" },
  other: { Icon: Link2, action: "Open" },
};

/** "Google Drive folder" or "Google Drive file" — the URL says which, and it
 *  is the difference a parent wants before tapping: one thing, or a list. */
function describe(url: string) {
  const drive = /drive\.google\.com|docs\.google\.com/.test(url);
  if (/\/drive\/folders\//.test(url)) return "Google Drive folder";
  if (drive) return "Google Drive file";
  return "Opens in a new tab";
}

export function ShowMediaTiles({ production }: { production: Production }) {
  const materials = production.materials ?? [];
  if (materials.length === 0) return null;
  return (
    <>
      {materials.map((m) => {
        const { Icon, action } = KIND[m.kind] ?? KIND.other;
        return (
          <a
            key={m.id}
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-ring/40 hover:bg-muted/40"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {m.label}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-2xl font-semibold">
              <Icon aria-hidden size={20} className="shrink-0 text-gold" />
              {action}
            </div>
            {/* The note, when there is one, is the thing the Director wanted
                said — it replaces the "Google Drive folder" line rather than
                stacking under it, so the tile keeps its height beside the
                numbers. */}
            {m.note ? (
              <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                {m.note}
                <span className="sr-only"> (opens in a new tab)</span>
              </div>
            ) : (
              <div className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
                {describe(m.url)}
                <ExternalLink aria-hidden size={10} />
                <span className="sr-only">(opens in a new tab)</span>
              </div>
            )}
          </a>
        );
      })}
    </>
  );
}
