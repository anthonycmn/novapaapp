import { notFound, redirect } from "next/navigation";
import { BookMarked, Ticket } from "lucide-react";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import type { CalendarEvent, FamilyCalendarEvent } from "@/lib/api/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { requestOrigin } from "@/lib/request-origin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatTile } from "@/components/ui/stat-tile";
import { ComingSoonCards, WhoToEmail } from "@/components/productions/who-to-email";
import { ShowPhotos } from "@/components/productions/show-photos";
import {
  RehearsalTracksHelp,
  RehearsalTracksTile,
} from "@/components/productions/rehearsal-tracks";
import { ShowMediaTiles } from "@/components/productions/media-tiles";
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
  const [staff, showStaff, events, familyEvents, scenes, roles, calendarToken, origin] =
    await Promise.all([
      provider.getStaffProfiles(),
      // This show's own creative team, for the contact card.
      provider.getProductionStaff(productionId),
      provider.getProductionCalendar(user.id, productionId),
      user.familyId
        ? provider.getFamilyCalendar(user.id, user.familyId)
        : Promise.resolve<FamilyCalendarEvent[]>([]),
      provider.getShowScenes(productionId),
      // The show's own cast, so the scene list's picker offers this
      // production's roles rather than a list typed into the component.
      provider.getShowRoles(productionId),
      // The subscribable feed is per-family, so staff without a family get
      // no button rather than a broken one.
      user.familyId
        ? provider.getCalendarToken(user.id, user.familyId)
        : Promise.resolve<string | null>(null),
      requestOrigin(),
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

  /*
   * Numbered scripts signed out to this family for THIS show — bug #9 in the
   * 25 Aug feedback: "there does not appear to be any information on the
   * portal regarding loaned manuscripts."
   *
   * Staff have recorded them since 23 Aug; twenty-three are out on Sweeney
   * alone. Nothing needed building but the family's half of it.
   */
  const myScripts = (await provider.getMyScripts(user.id)).filter(
    (script) => script.productionId === production.id
  );
  /*
   * Which of this family's children are registered for THIS show, and whether
   * their audition is in. Drives the auditions tile below — a family with
   * nobody in this show gets no tile rather than an empty form.
   */
  const auditioning = (
    await Promise.all(
      students.map(async (student) => {
        const enrollments = await provider.getEnrollmentsForStudent(user.id, student.id);
        const inThisShow = enrollments.some(
          (enrollment) =>
            enrollment.productionId === production.id && enrollment.status === "enrolled"
        );
        if (!inThisShow) return null;
        const existing = await provider.getAuditionProfile(
          user.id,
          student.id,
          production.id
        );
        return {
          studentId: student.id,
          studentName: student.preferredName ?? student.firstName,
          submitted: Boolean(existing),
        };
      })
    )
  ).filter((row): row is NonNullable<typeof row> => row !== null);

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
            studentId: student.id,
            studentName: student.preferredName ?? student.firstName,
          }));
      })
    )
  ).flat();

  /*
   * The per-child view of the schedule — CJ, 5 Sep 2026: a family should
   * identify at a glance what rehearsal is coming up FOR THEIR CHILD, what
   * that child will be doing, and whether they have told the show about a
   * conflict for it. The family calendar already worked out per student which
   * events they are called to; here it is keyed for the rail, alongside the
   * family's standing answers so every row shows its own record.
   */
  const railStudents = students.map((student) => ({
    id: student.id,
    name: student.preferredName ?? student.firstName,
    roleNames: myRoles
      .filter((role) => role.studentId === student.id)
      .map((role) => role.characterName),
  }));
  const calledStudentsByEvent = Object.fromEntries(
    familyEvents
      .filter((event) => event.productionId === production.id)
      .map((event) => [event.id, event.studentIds])
  );
  const callAnswers = Object.fromEntries(
    (user.familyId ? await provider.getMyCallResponses(user.id) : []).map((response) => [
      `${response.eventId}:${response.studentId}`,
      { status: response.status, reason: response.reason },
    ])
  );

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

      {/* The stat row, the same shape as the staff portal's show page — but
          carrying what a FAMILY needs, not what an admin does. Deliberately
          nothing about anyone else's child: no roster counts, no unresolved
          names, nothing medical. A parent's own child's role is theirs to
          see; every other family's is not.

          FOUR ACROSS, NOT FIVE. CJ, 26 Aug: "so four tiles per row. Move
          Audition to first row." It was five wide for Sweeney, which pushed
          Rehearsal Tracks off the right edge of a laptop and dropped Audition
          onto a line of its own — the one tile with something for a parent to
          DO was the one below the fold.

          The order is now the order a family reads in: when it opens, what
          they are next called to, who their child is playing, and what the
          audition still needs from them. Then a second row of material to
          work from at home — the tracks, and the folders beside them. Performances goes last because
          the count is already in the subtitle and the ticket button is in the
          header; it is the least clicked thing here. */}
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
        {/* The auditions tab, and only for a child actually in this show.
            It sits with the other tiles rather than in the sidebar because a
            parent arrives here from a "casting is open" post, not from a
            navigation menu — and it sits in the FIRST row because it is the
            only tile on this page asking a family for something. */}
        {auditioning.length > 0 && (
          <StatTile
            label={auditioning.length > 1 ? "Auditions" : "Audition"}
            value={
              auditioning.every((row) => row.submitted)
                ? "Submitted"
                : auditioning.some((row) => row.submitted)
                  ? "Part done"
                  : "To do"
            }
            hint={
              auditioning.length === 1
                ? `Song, video and hopes for ${auditioning[0].studentName}`
                : `${auditioning.length} performers`
            }
            tone={auditioning.every((row) => row.submitted) ? "good" : "warn"}
            href={
              auditioning.length === 1
                ? `/auditions/${production.id}/${auditioning[0].studentId}`
                : "/auditions"
            }
          />
        )}

        {/* Second row: what a performer works from between calls. The tracks
            first, then the folders beside them — same group, same glance. */}
        {isSweeney && <RehearsalTracksTile />}
        <ShowMediaTiles production={production} />

        <StatTile
          label="Performances"
          value={performanceCount}
          hint={performanceCount > 0 ? "Tickets on BookTix" : "Dates to be confirmed"}
        />
      </div>

      {/* The one question this page exists to answer, at the size it
          deserves — then the run, for the dates families send to relatives. */}
      <NextCall
        event={nextCall}
        productionId={production.id}
        students={railStudents}
        calledStudentIds={nextCall ? (calledStudentsByEvent[nextCall.id] ?? []) : []}
        answers={callAnswers}
      />

      {myScripts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookMarked aria-hidden className="size-4" /> Scripts on loan
            </CardTitle>
            <CardDescription>
              Numbered and signed out to you. Please return the same copy — the number is
              how we know whose it is.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {myScripts.map((script) => (
              <div
                key={script.studentId + script.scriptNumber}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span className="font-medium">{script.studentName}</span>
                <span className="font-mono text-sm">#{script.scriptNumber}</span>
                <Badge variant={script.status === "returned" ? "secondary" : "gold"}>
                  {script.status === "returned" ? "returned" : "on loan"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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

          {isSweeney && <RehearsalTracksHelp />}

          {/* Photos of their child, as photos. This used to be a tile that
              said "Photos" and went somewhere else — a parent had to navigate
              to find out whether there was anything to navigate for. Renders
              nothing when there are no matches. */}
          <ShowPhotos userId={user.id} familyId={user.familyId} />

          {/* No longer gated on the title. The component reads the rows it is
              handed and renders nothing when a show has no breakdown loaded,
              so any production that gets one gets the list — Sweeney was only
              special because its breakdown lived in a file. */}
          <ScenesAndSongs rows={scenes} roles={roles} />

          <WhoToEmail showStaff={showStaff} showTitle={production.title} />

          <ComingSoonCards />
        </div>

        {/* ---- Right: the calendar, as a list ---- */}
        <div className="lg:col-span-1">
          <ScheduleRail
            events={events}
            myEventIds={myEventIds}
            sceneNames={sceneNames}
            feedUrl={calendarToken ? `${origin}/api/calendar/${calendarToken}` : undefined}
            productionTitle={production.title}
            students={railStudents}
            calledStudentsByEvent={calledStudentsByEvent}
            answers={callAnswers}
          />
        </div>
      </div>
    </>
  );
}

