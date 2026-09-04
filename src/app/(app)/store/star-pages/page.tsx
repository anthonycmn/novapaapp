import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StarPageForm } from "./star-page-form";
import { NotYetAvailable } from "@/components/not-yet-available";
import { isStoreFeatureOpen } from "@/lib/store-availability";

export const metadata = { title: "Star pages" };

/**
 * Star pages, show first — the same two-step shape as spirit buttons, for the
 * same reason: which show decides which playbill, so it is not a dropdown
 * buried above the message box.
 */
export default async function StarPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  /* Closed to families for now — see lib/store-availability. Returned before
     anything is loaded: there is no sense querying templates and enrolments
     for a page that is going to say "not yet". */
  if (!isStoreFeatureOpen("starPages")) {
    return (
      <div className="flex flex-col gap-4">
        <SectionHeader title="Star pages" />
        <NotYetAvailable feature="starPages" />
      </div>
    );
  }
  const { show } = await searchParams;

  const provider = getProvider();
  const [products, productions, enrollments, students] = await Promise.all([
    provider.getProducts(),
    provider.getProductions(),
    user.familyId
      ? provider.getEnrollmentsForFamily(user.id, user.familyId)
      : Promise.resolve([]),
    user.familyId
      ? provider.getStudentsForFamily(user.id, user.familyId)
      : Promise.resolve([]),
  ]);

  const starPages = products.filter(
    (product) => product.type === "star_page" && product.isActive && product.productionId
  );
  const byProduction = new Map(starPages.map((product) => [product.productionId!, product]));

      /*
       * Their shows and nothing else — CJ, 4 Sep 2026: "when I click on spirit
       * buttons or star pages - I only want my show to pop up that I am
       * enrolled in."
       *
       * It used to list every show that had artwork and merely sort a family's
       * own to the top, which meant a parent of one performer scrolling a
       * catalogue of twenty other people's productions and, worse, being able
       * to order a button for a show their child is not in.
       */
      const offered = productions
    .filter(
      (production) =>
        byProduction.has(production.id) &&
        enrollments.some(
          (enrollment) =>
            enrollment.productionId === production.id &&
            enrollment.status !== "withdrawn"
        )
    )
    .map((production) => ({
      production,
      product: byProduction.get(production.id)!,
    }))
    .sort((a, b) => a.production.title.localeCompare(b.production.title));

  const chosen = show ? offered.find((row) => row.production.id === show) : undefined;

  if (chosen) {
    return (
      <>
        <SectionHeader
          as="h1"
          title={`Star page — ${chosen.production.title}`}
          subtitle="A tribute printed in the playbill, in your own words"
          right={
            <Link
              href="/store/star-pages"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-muted"
            >
              <ArrowLeft aria-hidden size={14} />
              Change show
            </Link>
          }
        />
        <StarPageForm
          product={chosen.product}
          production={chosen.production}
          students={students}
        />
      </>
    );
  }

  return (
    <>
      <SectionHeader
        as="h1"
        title="Star pages"
        subtitle="Quarter page $50 · half page $90 · full page $140"
      />

      {offered.length === 0 ? (
        <Card>
          <p className="p-10 text-center text-[13px] text-muted-foreground">
            No playbills are taking star pages yet. They open as each show goes
            into production.
          </p>
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {offered.map(({ production }) => (
            <Link
              key={production.id}
              href={`/store/star-pages?show=${production.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:border-ring/40 hover:bg-muted/40"
            >
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium leading-snug">
                  {production.title}
                </span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  {production.venue.split(",")[0]}
                </span>
              </span>
              <ArrowRight aria-hidden size={15} className="shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
