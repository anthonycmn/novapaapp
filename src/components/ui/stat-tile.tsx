import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The staff portal's stat tile — the row of numbers that opens its dashboard.
 * A label, a big tabular figure, and a hint that says what the figure is out
 * of, because a bare number is rarely actionable on its own.
 *
 * `href` makes the whole tile a link; the staff portal's version takes an
 * onClick, but everything a parent would want to reach from a number here is
 * a page.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "warn" | "danger" | "good";
  href?: string;
}) {
  const tones = {
    default: "text-foreground",
    warn: "text-gold",
    danger: "text-destructive",
    good: "text-foreground",
  } as const;

  const body = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tones[tone])}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[12px] text-muted-foreground">{hint}</div>}
    </>
  );

  const className = cn(
    "block rounded-lg border bg-card p-4 text-left shadow-[var(--shadow-card)]",
    href && "transition-colors hover:border-ring/40 hover:bg-muted/40"
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
