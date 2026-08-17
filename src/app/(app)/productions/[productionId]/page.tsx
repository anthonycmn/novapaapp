import { notFound, redirect } from "next/navigation";
import { Ticket } from "lucide-react";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import type { CalendarEvent } from "@/lib/api/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { SectionHeader } from "@/components/ui/section-header";
import { StatTile } from "@/components/ui/stat-tile";
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

  /**
   * Two calendars, deliberately.
   *
   * `events` is the whole show — every call, from anyone's point of view.
   * `myEventIds` is the subset this family is actually called to. The page
   * used to show only the second, which meant a family not yet enrolled (and
   * every member of staff) opened the show page to an empty schedule and
   * concluded the calendar was broken. Now the run is always there, with
   * their own calls marked and selected by default.
   */
  const [staff, events, familyEvents, scenes] = await Promise.all([
    provider.getStaffProfiles(),
    provider.getProductionCalendar(user.id, productionId),
    user.familyId
      ? provider.getFamilyCalendar(user.id, user.familyId)
      : Promise.resolve<CalendarEvent[]>([]),
    provider.getShowScenes(productionId),
  ]);

  // Scene-tagged rehearsals carry ids; the rail needs names to say what a
  // call is working.
  const sceneNames = Object.fromEntries(scenes.map((scene) => [scene.id, scene.name]));

  const director = staff.find((member) => member.id === production.directorStaffId);
  // The hub calls it "Sweeney Todd - Teen Conservatory"; the staff portal
  // calls it "Sweeney Todd: School Edition". Match on the title both share.
  const isSweeney = production.title.toLowerCase().includes("sweeney");

  const myEventIds = familyEvents
    .filter((event) => event.productionId === production.id)
    .map((event) => event.id);
  const mine = new Set(myEventIds);

  const now = new Date().toISOString();
  const byDate = (a: CalendarEvent, b: CalendarEvent) =>
    a.startsAt.localeCompare(b.startsAt);
  const upcoming = events.filter((event) => event.endsAt >= now).sort(byDate);
  // Their own next call if they have one; otherwise the show's, so the hero
  // still answers "what happens next" for staff and for families whose
  // enrollment has not landed yet.
  const nextCall = upcoming.find((event) => mine.has(event.id)) ?? upcoming[0];

  const performances = events.filter((e) => e.type === "performance").sort(byDate);
  const performanceCount = performances.length;

  /**
   * Opening night: the production row's own date when it has one, otherwise
   * the first performance on the calendar. Several shows carry a null
   * `opensOn` because the run is scheduled in the staff portal rather than
   * typed into the production record — and "TBC" on a show with seven
   * performances already on the calendar is just wrong.
   */
  const opensAt = production.opensOn
    ? `${production.opensOn}T12:00:00Z`
    : (performances[0]?.startsAt ?? null);
  const daysToOpening = opensAt
    ? Math.ceil((new Date(opensAt).getTime() - Date.now()) / 86_400_000)
    : null;

  /**
   * This family's own children's roles in this show, and nothing else.
   *
   * getCastingForStudent is called per own-child and the provider scopes each
   * call to the caller, so there is no path here to another family's casting
   * — which is the point. Unpublished assignments are filtered out too: a
   * parent seeing a role before the director releases it is the same leak
   * from the other direction.
   */
  const students = user.familyId
    ? await provider.getStudentsForFamily(user.id, user.familyId)
    : [];
  const myRoles = (
    await Promise.all(
      students.map(async (student) => {
        const assignments = await provider.getCastingForStudent(user.id, student.id);
        return assignments
          .filter((a) => a.productionId === production.id && a.publishedAt)
          .map((a) => ({
            characterName: a.isUnderstudy
              ? `${a.characterName} (understudy)`
              : a.characterName,
            studentName: student.preferredName ?? student.firstName,
          }));
      })
    )
  ).flat();

  return (
    <>
      <SectionHeader
        as="h1"
        title={production.title}
        subtitle={
          [
            production.venue,
            opensAt ? `opens ${formatDate(opensAt)}` : null,
            performanceCount > 0
              ? `${performanceCount} ${performanceCount === 1 ? "performance" : "performances"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")
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

      {/* Four tiles across the top, the same shape as the staff portal's show
          page — but carrying what a FAMILY needs, not what an admin does.
          Deliberately nothing about anyone else's child: no roster counts, no
          unresolved names, nothing medical. A parent's own child's role is
          theirs to see; every other family's is not. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={daysToOpening !== null && daysToOpening < 0 ? "The run" : "Opening night"}
          value={
            daysToOpening === null
              ? "TBC"
              : daysToOpening < 0
                ? "Under way"
                : daysToOpening === 0
                  ? "Tonight"
                  : `${daysToOpening} days`
          }
          hint={opensAt ? formatDate(opensAt) : "Date not set"}
          tone={daysToOpening !== null && daysToOpening <= 14 ? "warn" : "default"}
        />
        <StatTile
          label={nextCall && mine.has(nextCall.id) ? "Your next call" : "Next on the calendar"}
          value={nextCall ? formatDate(nextCall.startsAt) : "—"}
          hint={nextCall ? nextCall.title : "Nothing scheduled yet"}
          href="/schedule"
        />
        <StatTile
          label={myRoles.length > 1 ? "Your children's roles" : "Your child's role"}
          value={myRoles.length > 0 ? myRoles[0].characterName : "Not yet cast"}
          hint={
            myRoles.length > 1
              ? myRoles
                  .slice(1)
                  .map((r) => r.characterName)
                  .join(", ")
              : myRoles.length === 1
                ? myRoles[0].studentName
                : "Casting appears here once it is published"
          }
          href="/casting"
        />
        <StatTile
          label="Performances"
          value={performanceCount}
          hint={performanceCount > 0 ? "Tickets on BookTix" : "Dates to be confirmed"}
        />
      </div>

      {/* The one question this page exists to answer, at the size it
          deserves — then the run, for the dates families send to relatives. */}
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
        </div>

        {/* ---- Right: the calendar, as a list ---- */}
        <div className="lg:col-span-1">
          <ScheduleRail
            events={events}
            myEventIds={myEventIds}
            sceneNames={sceneNames}
            productionTitle={production.title}
          />
        </div>
      </div>
    </>
  );
}

