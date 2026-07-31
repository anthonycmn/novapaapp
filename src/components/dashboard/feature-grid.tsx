import Link from "next/link";
import { FAMILY_SECTIONS, STAFF_SECTIONS, type NavSection } from "@/config/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Everything the app can do, in one place — rendered from the same section
 * lists as the hamburger menu (src/config/navigation.ts).
 */
function Grid({ items }: { items: NavSection[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <Link key={item.href} href={item.href}>
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardContent className="flex flex-col gap-1 p-3">
              <span aria-hidden className="text-xl">
                {item.emoji}
              </span>
              <span className="text-sm font-medium leading-tight">{item.label}</span>
              <span className="text-xs leading-tight text-muted-foreground">
                {item.description}
              </span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function FeatureGrid({ isStaff }: { isStaff: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Everything in the app</CardTitle>
        <CardDescription>
          Also in the menu (☰) at the top — same list, always.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <Grid items={FAMILY_SECTIONS} />
        {isStaff && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
              Staff &amp; admin
            </h3>
            <Grid items={STAFF_SECTIONS} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
