import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Ticket } from "lucide-react";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import type { CalendarEvent } from "@/lib/api/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { SectionHeader } from "@/components/ui/section-header";
import { ComingSoonCards, WhoToEmail } from "@/components/productions/who-to-email";
import { ShowPhotos } from "@/components/productions/show-photos";
import { RehearsalTracks } from "@/components/productions/rehearsal-tracks";
import { ScenesAndSongs } from "@/components/productions/scenes-and-songs";
import { ScheduleRail } from "@/components/productions/schedule-rail";
import { NextCall, PerformanceStrip } from "@/components/productions/next-call";
import { ShowFeed } from "@/components/productions/show-feed";

export const metadata = { title: "Production" };

/**
 * A show's own dashboard, for the family (Tony, 16 Aug 2026: "I want the
 * parent portal page for Sweeney Todd to feel like a dashboard").
 *
 * Same shape as the home dashboard and the staff portal's: a stat row of the
 * numbers that answer "where are we", then a two-column body with the
 * schedule pinned down the right as a list. On a phone the rail simply falls
 * to the bottom of the stack, after the things a parent reads rather than
 * scans.
 */
export default async function ProductionPage({
  params,
}: {
  params: Promise<{ productionId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { productionId } = await params;

  const provider = getProvider();
  const production = await provider.getProduction(productionId);
  if (!production) notFound();

  const [staff, allEvents] = await Promise.all([
    provider.getStaffProfiles(),
    user.familyId
      ? provider.getFamilyCalendar(user.id, user.familyId)
      : hasRoleAtLeast(user, "staff")
        ? provider.getAllEvents(user.id)
        : Promise.resolve<CalendarEvent[]>([]),
  ]);

  const director = staff.find((member) => member.id === production.directorStaffId);
  // The hub calls it "Sweeney Todd - Teen Conservatory"; the staff portal
  // calls it "Sweeney Todd: School Edition". Match on the title both share.
  const isSweeney = production.title.toLowerCase().includes("sweeney");

  const events = allEvents.filter((event) => event.productionId === production.id);
  const now = new Date().toISOString();
  const upcoming = events.filter((event) => event.endsAt >= now);
  const nextCall = [...upcoming].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt)
  )[0];

  return (
    <>
      <SectionHeader
        as="h1"
        title={production.title}
        subtitle={
          production.venue +
          (production.opensOn ? ` · opens ${formatDate(`${production.opensOn}T12:00:00Z`)}` : "")
        }
        right={
          <a
            href={production.ticketsUrl ?? org.ticketsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Ticket aria-hidden size={14} />
            Buy tickets
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        }
      />

      {/* The one question this page exists to answer, at the size it
          deserves — then the run, for the dates families send to relatives.
          The generic four-tile stat row that used to sit here said
          "Calls remaining: 6", which is not a thing anyone needed. */}
      <NextCall event={nextCall} />

      <PerformanceStrip events={events} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---- Left: what a parent reads ---- */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ShowFeed
            productionId={production.id}
            productionTitle={production.title}
            userId={user.id}
            isStaff={hasRoleAtLeast(user, "staff")}
          />

          {isSweeney && <RehearsalTracks />}

          {/* Photos of their child, as photos. This used to be a tile that
              said "Photos" and went somewhere else — a parent had to navigate
              to find out whether there was anything to navigate for. Renders
              nothing when there are no matches. */}
          <ShowPhotos userId={user.id} familyId={user.familyId} />

          {isSweeney && <ScenesAndSongs />}

          <WhoToEmail director={director} />

          <ComingSoonCards />

          {hasRoleAtLeast(user, "staff") && (
            <Link
              href={`/admin/casting-review/${production.id}`}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-primary underline-offset-4 hover:underline"
            >
              Open pre-casting review <ArrowRight aria-hidden size={13} />
            </Link>
          )}
        </div>

        {/* ---- Right: the calendar, as a list ---- */}
        <div className="lg:col-span-1">
          <ScheduleRail events={events} productionTitle={production.title} />
        </div>
      </div>
    </>
  );
}

