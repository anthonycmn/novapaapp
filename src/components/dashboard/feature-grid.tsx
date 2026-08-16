import Link from "next/link";
import { FAMILY_SECTIONS, STAFF_SECTIONS, type NavSection } from "@/config/navigation";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * Everything the portal can do, in one place — rendered from the same section
 * lists as the sidebar (src/config/navigation.ts), so the two can never drift.
 */
function Grid({ items }: { items: NavSection[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(({ href, label, description, Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-start gap-2.5 rounded-md border bg-card px-3 py-2.5 transition-colors hover:bg-muted"
        >
          <Icon aria-hidden size={15} className="mt-0.5 shrink-0 text-gold" />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium leading-tight">{label}</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
              {description}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function FeatureGrid({ isStaff }: { isStaff: boolean }) {
  return (
    <Card pad={false}>
      <SectionHeader title="Everything in the portal" inCard />
      <div className="flex flex-col gap-4 p-4">
        <Grid items={FAMILY_SECTIONS} />
        {isStaff && (
          <div>
            <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-gold">
              Staff &amp; admin
            </h3>
            <Grid items={STAFF_SECTIONS} />
          </div>
        )}
      </div>
    </Card>
  );
}
