import Image from "next/image";
import { org } from "@/config/org";
import { cn } from "@/lib/utils";

/**
 * The butterfly, in whichever cut reads on the current background.
 *
 * Two files rather than one recoloured file, same as the staff portal: the mark
 * is navy-and-gold, and no CSS filter turns navy-and-gold into white without
 * also flattening the gold. On dark, the all-white cut is the one the brand
 * actually ships for the purpose.
 *
 * Swapped with `dark:` classes rather than a theme hook so this stays a server
 * component and neither cut flashes on first paint.
 */
export function Logo({
  size = 32,
  className,
  standalone = false,
}: {
  size?: number;
  className?: string;
  standalone?: boolean;
}) {
  const shared = cn("shrink-0 select-none object-contain", className);
  return (
    <>
      <Image
        src="/brand/novapa-mark.png"
        alt={standalone ? `${org.name} logo` : ""}
        aria-hidden={standalone ? undefined : true}
        width={size}
        height={size}
        className={cn(shared, "dark:hidden")}
        priority
      />
      <Image
        src="/brand/novapa-mark-white.png"
        alt=""
        aria-hidden
        width={size}
        height={size}
        className={cn(shared, "hidden dark:block")}
        priority
      />
    </>
  );
}

/**
 * Mark plus name — the staff portal's wordmark, with the one word that differs.
 *
 * Tony, 17 Aug 2026: "the logo in the top left corner. I like the staff portal
 * one, and I want it to be the Nova PA parent portal one, but replace the word
 * staff with parent."
 */
export function Wordmark({
  size = 32,
  tagline = false,
}: {
  size?: number;
  /** Swap the product line for the mission, on the sign-in card. */
  tagline?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Logo size={size} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-display text-[15px] font-bold tracking-tight text-foreground">
          NoVAPA
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {tagline ? org.mission : "Parent Portal"}
        </span>
      </span>
    </span>
  );
}
