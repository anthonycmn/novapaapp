import { cn } from "@/lib/utils";

/**
 * The staff portal's page heading: title, optional subtitle, optional
 * right-hand action row that wraps under on a phone.
 *
 * `inCard` is the same header as a card's top strip — a bottom border instead
 * of bottom margin, used with `<Card pad={false}>`.
 */
export function SectionHeader({
  title,
  subtitle,
  right,
  inCard = false,
  as: Tag = "h2",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  inCard?: boolean;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-3",
        inCard ? "border-b px-4 py-3" : "mb-4"
      )}
    >
      <div>
        <Tag
          className={cn(
            "font-semibold tracking-tight text-foreground",
            inCard ? "text-[14px]" : "text-xl"
          )}
        >
          {title}
        </Tag>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}
