import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * One show or one class, as a tile you can tell is a tile.
 *
 * Tony, 17 Aug 2026: "easy to find, easy to click, easy to access. They should
 * be clickable. When I hover over them, I want the tiles to change colours,
 * letting people know they can click them."
 *
 * The old list said "clickable" with a shadow that appeared on hover, which is
 * a change you only notice once you are already on the thing. This changes the
 * surface instead — the whole tile washes gold — so the affordance is visible
 * from across the page, and the wash is the same 12% gold the rest of the
 * portal uses for "this is the live one" rather than a new colour invented
 * here.
 *
 * The whole tile is the link, not the title inside it. A parent tapping the
 * venue line on a phone should not have to find the four words that happen to
 * be the anchor.
 */
export function OfferingTile({
  href,
  Icon,
  title,
  subtitle,
  meta,
  badge,
}: {
  href: string;
  Icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** The one line worth reading after the title — next call, day and time. */
  meta?: string;
  /** "You're in this one", "Opens in 6 days". */
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="gold-hover group flex items-start gap-3 rounded-lg border bg-card p-4 shadow-[var(--shadow-card)] transition-colors"
    >
      <span className="gold-band mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md border">
        <Icon aria-hidden size={17} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-semibold leading-snug">{title}</span>
          {badge && (
            <span className="gold-band rounded-full border px-2 py-0.5 text-[11px] font-medium">
              {badge}
            </span>
          )}
        </span>
        {subtitle && (
          <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
            {subtitle}
          </span>
        )}
        {meta && <span className="mt-1 block text-[12.5px]">{meta}</span>}
      </span>

      {/* Moves on hover as well as changing colour, so the affordance survives
          for anyone who cannot separate the two golds. */}
      <ArrowRight
        aria-hidden
        size={16}
        className="mt-1 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
