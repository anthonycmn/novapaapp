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
   * The family's own shows first, then everything else by opening night. A
   * parent opening this page is nearly always looking for the show their child
   * is in; making them find it among twenty-four is the thing this page exists
   * to stop.
   */
  /*
   * Sorted by when each show ACTUALLY opens, which is a calendar fact rather
   * than a column: opensOn is null on all twenty-four, so sorting by it left
   * the list in arbitrary order and dated none of it.
   */
  const openingOf = (production: (typeof productions)[number]) =>
    openingNight(production, runs[production.id]) ?? "9999";

  const sorted = [...productions].sort((a, b) => {
    const minePriority = Number(mine.has(b.id)) - Number(mine.has(a.id));
    if (minePriority !== 0) return minePriority;
    return openingOf(a).localeCompare(openingOf(b));
  });

  const ours = sorted.filter((production) => mine.has(production.id));
  const rest = sorted.filter((production) => !mine.has(production.id));

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

      {productions.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No shows announced yet.
          </CardContent>
        </Card>
      ) : (
        <>
          {ours.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {ours.length === 1 ? "Your show" : "Your shows"}
              </h2>
              {ours.map(tileFor)}
            </section>
          )}

          {rest.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {ours.length > 0 ? "Everything else on" : "On this season"}
              </h2>
              {rest.map(tileFor)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
