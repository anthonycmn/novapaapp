import Link from "next/link";
import { redirect } from "next/navigation";
import { Drama, Ticket } from "lucide-react";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import type { FamilyCalendarEvent } from "@/lib/api/types";
import { getSessionUser } from "@/lib/auth/session";
import {
  daysUntil,
  describeRun,
  openingNight,
} from "@/lib/api/productions/run";
import { formatDate, formatEventTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLinkButton } from "@/components/external-link-button";
import { OfferingTile } from "@/components/productions/offering-tile";

export const metadata = { title: "Shows" };

/**
 * Every show, with the family's own first.
 *
 * Split out of a single "Productions" page on 17 Aug 2026 — shows and classes
 * are different things a parent looks for on different days, and one list of
 * both meant scrolling past nine musicals to find a Tuesday dance class. The
 * titles are the ones the staff portal writes ("Sweeney Todd - Teen
 * Conservatory"), because a parent who hears a title at pickup should find the
 * same words here.
 */
export default async function ShowsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const provider = getProvider();

  const [productions, runs, enrollments, events] = await Promise.all([
    provider.getProductions(),
    provider.getProductionRuns(),
    user.familyId
      ? provider.getEnrollmentsForFamily(user.id, user.familyId)
      : Promise.resolve([]),
    user.familyId
      ? provider.getFamilyCalendar(user.id, user.familyId)
      : Promise.resolve<FamilyCalendarEvent[]>([]),
  ]);

  const mine = new Set(
    enrollments
      .filter((enrollment) => enrollment.status !== "withdrawn")
      .map((enrollment) => enrollment.productionId)
      .filter(Boolean)
  );

  const nowIso = new Date().toISOString();
  const nextCallFor = (productionId: string) =>
    events
      .filter((event) => event.productionId === productionId && event.endsAt >= nowIso)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  /*
   * ONLY the shows this family is registered for. Tony, 17 Aug 2026: "when I
   * see shows in the parent portal I only want to see the shows I've
   * registered for — not all of them."
   *
   * The page used to lead with theirs and list the other twenty-three below,
   * on the theory that it helped families discover what else was running. It
   * did not: these are internal production records, not bookable offerings —
   * several are tech placeholders and next season's — so the list answered a
   * question nobody asked while burying the one show a parent came for.
   * Discovery belongs to "Sign up for something" on the dashboard, which reads
   * the real catalog and links straight to booking.
   *
   * Sorted by when each show ACTUALLY opens, which is a calendar fact rather
   * than a column: opensOn is null on all twenty-four, so sorting by it left
   * the list in arbitrary order and dated none of it.
   */
  const openingOf = (production: (typeof productions)[number]) =>
    openingNight(production, runs[production.id]) ?? "9999";

  // Staff have no family, and no enrollments — for them the whole season is
  // the point of the page.
  const ours = productions
    .filter((production) => (user.familyId ? mine.has(production.id) : true))
    .sort((a, b) => openingOf(a).localeCompare(openingOf(b)));

  const tileFor = (production: (typeof productions)[number]) => {
    const nextCall = nextCallFor(production.id);
    const run = runs[production.id];
    const days = daysUntil(openingNight(production, run));
    return (
      <OfferingTile
        key={production.id}
        href={`/productions/${production.id}`}
        Icon={Drama}
        title={production.title}
        subtitle={[
          production.venue?.split(",")[0],
          describeRun(production, run, formatDate),
          run && run.performanceCount > 0
            ? `${run.performanceCount} ${run.performanceCount === 1 ? "performance" : "performances"}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        meta={
          nextCall
            ? `Next: ${formatEventTime(nextCall.startsAt)} — ${nextCall.title}`
            : undefined
        }
        badge={
          days !== null && days >= 0 && days <= 14
            ? days === 0
              ? "Opens tonight"
              : `${days} days`
            : undefined
        }
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Shows</h1>
        <ExternalLinkButton href={org.ticketsUrl} variant="outline">
          <Ticket aria-hidden className="size-4" />
          All tickets
        </ExternalLinkButton>
      </div>

      {ours.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Drama aria-hidden className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {user.familyId
                ? "You're not in a show at the moment"
                : "No shows announced yet"}
            </p>
            {user.familyId && (
              <p className="max-w-sm text-sm text-muted-foreground">
                Once your child is registered for one, it appears here with its
                calls and its run. What&apos;s open to sign up for is on your{" "}
                <Link
                  href="/dashboard"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  dashboard
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="flex flex-col gap-2">{ours.map(tileFor)}</section>

          {/* The absence route sits with the shows rather than only in the
              sidebar: a parent realizes their child will miss a rehearsal
              while looking at the rehearsal. */}
          {user.familyId && (
            <p className="text-[13px] text-muted-foreground">
              Will one of them miss a rehearsal or a performance?{" "}
              <Link
                href="/family/absences"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Report an absence
              </Link>{" "}
              and we will tell the show&apos;s director.
            </p>
          )}
        </>
      )}
    </div>
  );
}
