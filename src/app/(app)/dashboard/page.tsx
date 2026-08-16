import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ExternalLink, Ticket } from "lucide-react";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import type { CalendarEvent, Enrollment, Student } from "@/lib/api/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { EnrollmentsCard } from "@/components/dashboard/enrollments-card";
import { MissionPlaque, TipOfTheDay } from "@/components/dashboard/mission-card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatTile } from "@/components/ui/stat-tile";

export const metadata = { title: "Home" };

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const provider = getProvider();

  const isStaff = hasRoleAtLeast(user, "staff");
  let students: Student[] = [];
  let enrollments: Enrollment[] = [];
  if (user.familyId) {
    [students, enrollments] = await Promise.all([
      provider.getStudentsForFamily(user.id, user.familyId),
      provider.getEnrollmentsForFamily(user.id, user.familyId),
    ]);
  }
  const [productions, classes, unreadCount, familyEvents] = await Promise.all([
    provider.getProductions(),
    provider.getClasses(),
    provider.getUnreadNotificationCount(user.id),
    user.familyId
      ? provider.getFamilyCalendar(user.id, user.familyId)
      : Promise.resolve<CalendarEvent[]>([]),
  ]);

  const active = enrollments.filter((e) => e.status !== "withdrawn");
  const balanceCents = active.reduce((sum, e) => sum + e.balanceCents, 0);
  const firstName = user.displayName.split(" ")[0];

  /**
   * The shows this family is in, each with its next call — what replaced the
   * grid of every section in the portal. Ordered by whichever opens soonest,
   * because that is the one a parent is thinking about.
   */
  const nowIso = new Date().toISOString();
  const myShows = [
    ...new Set(active.map((e) => e.productionId).filter(Boolean)),
  ]
    .map((productionId) => {
      const production = productions.find((p) => p.id === productionId);
      if (!production) return null;
      const nextCall = familyEvents
        .filter((e) => e.productionId === production.id && e.endsAt >= nowIso)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      const days = production.opensOn
        ? Math.ceil(
            (new Date(`${production.opensOn}T12:00:00Z`).getTime() - Date.now()) /
              86_400_000
          )
        : null;
      return { production, nextCall, days };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));

  return (
    <>
      {/* Above everything, deliberately — the same place the staff portal puts
          "We Care". The first thing on the page should be the thing that
          outranks everything else on it. */}
      <MissionPlaque />
      <TipOfTheDay />

      <SectionHeader
        as="h1"
        title={firstName ? `Good to see you, ${firstName}` : "Home"}
        subtitle={
          isStaff && !user.familyId
            ? "Staff dashboard"
            : (user.family?.name ?? org.programBrand)
        }
        right={
          <Link
            href="/schedule"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Open the schedule <ArrowRight aria-hidden size={14} />
          </Link>
        }
      />

      {/* ---- The numbers a parent actually opens this for ---- */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Balance due"
          value={balanceCents > 0 ? `$${(balanceCents / 100).toFixed(2)}` : "$0.00"}
          hint={balanceCents > 0 ? "Payment outstanding" : "Nothing outstanding"}
          tone={balanceCents > 0 ? "warn" : "good"}
        />
        <StatTile
          label="Students enrolled"
          value={students.length}
          hint={`${active.length} active ${active.length === 1 ? "enrollment" : "enrollments"}`}
          href="/family"
        />
        <StatTile
          label="Unread notifications"
          value={unreadCount}
          hint={unreadCount ? "Waiting for you" : "You're all caught up"}
          tone={unreadCount > 0 ? "warn" : "good"}
          href="/notifications"
        />
        <StatTile
          label="Productions running"
          value={productions.length}
          hint="Show info and tickets"
          href="/productions"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {students.length > 0 && (
          <Card className="lg:col-span-2" pad={false}>
            <SectionHeader
              title="Your students"
              inCard
              right={
                <Link
                  href="/family"
                  className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                >
                  Family profile <ArrowRight aria-hidden size={13} />
                </Link>
              }
            />
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {students.map((student) => (
                <Link
                  key={student.id}
                  href={`/family/students/${student.id}`}
                  className="flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted"
                >
                  <Avatar
                    name={`${student.firstName} ${student.lastName}`}
                    src={student.headshotUrl}
                    className="size-8 text-[11px]"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">
                      {student.preferredName ?? student.firstName} {student.lastName}
                    </p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      Grade {student.grade}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}

        <UpcomingEvents
          actorId={user.id}
          familyId={user.familyId}
          isStaff={isStaff}
        />

        {user.familyId && (
          <div className="lg:col-span-2">
            <EnrollmentsCard
              enrollments={enrollments}
              students={students}
              productions={productions}
              classes={classes}
            />
          </div>
        )}

        <Card pad={false}>
          <SectionHeader title="Quick links" inCard />
          <div className="flex flex-col gap-2 p-4">
            <a
              href={org.ticketsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Ticket aria-hidden size={14} />
              Buy tickets on BookTix
              <ExternalLink aria-hidden size={13} />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <a
              href={org.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-muted"
            >
              {org.shortName} website
              <ExternalLink aria-hidden size={13} />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </Card>

        {/* The shows this family is actually in — the one journey a parent
            takes from here. This replaced a seventeen-tile grid of every
            section in the portal (Tony, 16 Aug 2026: "I don't want all these
            buttons that I have to click to go elsewhere"). The sidebar
            already carries navigation; the grid was a second copy of it. */}
        {myShows.length > 0 && (
          <div className="lg:col-span-3">
            <Card pad={false}>
              <SectionHeader
                title={myShows.length === 1 ? "Your show" : "Your shows"}
                inCard
                right={
                  <Link
                    href="/productions"
                    className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    All productions <ArrowRight aria-hidden size={13} />
                  </Link>
                }
              />
              <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {myShows.map(({ production, nextCall, days }) => (
                  <Link
                    key={production.id}
                    href={`/productions/${production.id}`}
                    className="rounded-md border p-3 transition-colors hover:bg-muted"
                  >
                    <p className="text-[13px] font-medium leading-snug">
                      {production.title}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {production.venue.split(",")[0]}
                      {days !== null &&
                        (days < 0
                          ? " · run under way"
                          : days === 0
                            ? " · opens tonight"
                            : ` · opens in ${days} days`)}
                    </p>
                    <p className="mt-1.5 text-[12px] text-gold">
                      {nextCall
                        ? `Next: ${formatEventTime(nextCall.startsAt)} — ${nextCall.title}`
                        : "No calls on your calendar yet"}
                    </p>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

async function UpcomingEvents({
  actorId,
  familyId,
  isStaff,
}: {
  actorId: string;
  familyId?: string;
  isStaff: boolean;
}) {
  // The family's own calendar (their enrollments only); staff without a
  // family see the org-wide schedule.
  const provider = getProvider();
  const events: CalendarEvent[] = familyId
    ? await provider.getFamilyCalendar(actorId, familyId)
    : isStaff
      ? await provider.getAllEvents(actorId)
      : [];
  const now = new Date().toISOString();
  const upcoming: CalendarEvent[] = events
    .filter((event) => event.endsAt >= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 4);

  return (
    <Card pad={false}>
      <SectionHeader
        title="Coming up"
        inCard
        right={
          <Link
            href="/schedule"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Schedule <ArrowRight aria-hidden size={13} />
          </Link>
        }
      />
      {upcoming.length === 0 ? (
        <p className="p-4 text-center text-[13px] text-muted-foreground">
          No upcoming events — enjoy the quiet before the next show week.
        </p>
      ) : (
        <ul className="divide-y">
          {upcoming.map((event) => (
            <li key={event.id} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{event.title}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {formatEventTime(event.startsAt)} · {event.location}
                  </p>
                </div>
                {event.changeNote && (
                  <Badge variant="gold" className="shrink-0">
                    Updated
                  </Badge>
                )}
              </div>
              {event.changeNote && (
                <p className="mt-1 text-[12px] text-gold">{event.changeNote}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
