import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getProvider } from "@/lib/api";
import { SPIRIT_BUTTON_PRICE_CENTS } from "@/lib/api/types";
import { getSessionUser } from "@/lib/auth/session";
import { formatCents } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { SpiritButtonForm } from "./spirit-button-form";
import { NotYetAvailable } from "@/components/not-yet-available";
import { isFeatureOpen } from "@/lib/feature-availability";

export const metadata = { title: "Spirit buttons" };

/**
 * Spirit buttons, show first.
 *
 * Tony, 17 Aug 2026: "create a spirit button page where they click the show,
 * their spirit button ... they upload their photo and their child's name, and
 * it generates what the spirit button looks like."
 *
 * Two steps, because "which show" is a decision a parent makes instantly and
 * everything after it depends on the answer. A single page with a show
 * dropdown buried above the photo picker made the show feel optional; it is
 * not, it decides the artwork.
 */
export default async function SpiritButtonsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  /* Closed to families for now — see lib/store-availability. Returned before
     anything is loaded: there is no sense querying templates and enrolments
     for a page that is going to say "not yet". */
  if (!isFeatureOpen("spiritButtons")) {
    return (
      <div className="flex flex-col gap-4">
        <SectionHeader title="Spirit buttons" />
        <NotYetAvailable feature="spiritButtons" />
      </div>
    );
  }
  const { show } = await searchParams;

  const provider = getProvider();
  const [templates, productions, enrollments, students] = await Promise.all([
    provider.getButtonTemplates(),
    provider.getProductions(),
    user.familyId
      ? provider.getEnrollmentsForFamily(user.id, user.familyId)
      : Promise.resolve([]),
    user.familyId
      ? provider.getStudentsForFamily(user.id, user.familyId)
      : Promise.resolve([]),
  ]);

  const byProduction = new Map(templates.map((t) => [t.productionId, t]));
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
      template: byProduction.get(production.id)!,
    }))
    .sort((a, b) => a.production.title.localeCompare(b.production.title));

  const chosen = show ? offered.find((row) => row.production.id === show) : undefined;

  /* ---- Step 2: design the button for the chosen show ---- */
  if (chosen) {
    return (
      <>
        <SectionHeader
          as="h1"
          title={`Spirit button — ${chosen.production.title}`}
          subtitle={`${formatCents(SPIRIT_BUTTON_PRICE_CENTS)} each · add a photo and your performer's name`}
          right={
            <Link
              href="/store/buttons"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-muted"
            >
              <ArrowLeft aria-hidden size={14} />
              Change show
            </Link>
          }
        />
        <SpiritButtonForm
          template={chosen.template}
          production={chosen.production}
          students={students}
        />
      </>
    );
  }

  /* ---- Step 1: pick the show ---- */
  return (
    <>
      <SectionHeader
        as="h1"
        title="Spirit buttons"
        subtitle={`${formatCents(SPIRIT_BUTTON_PRICE_CENTS)} each · pick the show, add a photo, see your button`}
      />

      {offered.length === 0 ? (
        <Card>
          <p className="p-10 text-center text-[13px] text-muted-foreground">
            No shows are taking spirit buttons yet. They open as each show is
            announced.
          </p>
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {offered.map(({ production }) => (
            <Link
              key={production.id}
              href={`/store/buttons?show=${production.id}`}
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
