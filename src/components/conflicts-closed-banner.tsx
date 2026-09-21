import { CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "We are no longer accepting conflicts at this time."
 *
 * CJ, 21 Sep 2026, for Sweeney Todd: "Disable the ability to report conflicts
 * in the parent portal for Sweeney Todd and put a banner in there that says,
 * we are no longer accepting conflicts at this time."
 *
 * One component so the show page, the absence form and the attendance box
 * say it in the same words. The sentence is his; the show's title is added
 * so a family with a child in two shows knows which one it is about.
 */
export const CONFLICTS_CLOSED_MESSAGE =
  "We are no longer accepting conflicts at this time.";

export function ConflictsClosedBanner({
  productionTitles,
  compact = false,
  className,
}: {
  /** The closed show or shows this banner is about. */
  productionTitles: string[];
  /** The one-line version for inside a dialog. */
  compact?: boolean;
  className?: string;
}) {
  if (productionTitles.length === 0) return null;
  const shows = productionTitles.join(" and ");

  return (
    <div
      role="status"
      data-testid="conflicts-closed"
      className={cn(
        "flex items-start gap-2 rounded-md border border-gold/40 bg-tip text-tip-foreground",
        compact ? "p-2.5 text-[12.5px] leading-snug" : "p-3 text-sm leading-relaxed",
        className
      )}
    >
      <CalendarOff aria-hidden className={cn("mt-0.5 shrink-0", compact ? "size-3.5" : "size-4")} />
      <p>
        <span className="font-semibold">{CONFLICTS_CLOSED_MESSAGE}</span>{" "}
        {compact ? (
          <>Conflicts for {shows} are closed; you can still confirm attendance.</>
        ) : (
          <>
            Conflicts for {shows} are closed. If something urgent comes up,
            please email the office.
          </>
        )}
      </p>
    </div>
  );
}
