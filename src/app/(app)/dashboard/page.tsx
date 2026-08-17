import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BadgeCheck, CalendarDays, Star } from "lucide-react";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import { todayKey } from "@/lib/calendar/week";
import type {
  AppNotification,
  Enrollment,
  FamilyCalendarEvent,
  Student,
} from "@/lib/api/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { EnrollmentsCard } from "@/components/dashboard/enrollments-card";
import { MissionPlaque, TipOfTheDay } from "@/components/dashboard/mission-card";
import {
  AlertBand,
  NewsPanel,
  NotificationsPanel,
  RegisterPanel,
  StaffHighlight,
} from "@/components/dashboard/panels";
import { WeekCalendar } from "@/components/dashboard/week-calendar";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatTile } from "@/components/ui/stat-tile";

export const metadata = { title: "Dashboard" };

/**
 * The dashboard — the one page a parent should be able to open and know where
 * they stand.
 *
 * It replaced a home page that summarised the portal and a "This week" group
 * in the sidebar that split the same week across three destinations (Tony,
 * 17 Aug 2026: "I would like for this week to turn into a dashboard and
 * replace home… everything under this week to be on the dashboard"). Those
 * three pages still exist and are still the place to go for the whole
 * calendar, the whole feed and every notification ever sent; what changed is
 * that you no longer have to visit all three to find out whether anything is
 * happening tonight.
 *
 * The order down the page is the order the questions get asked: has anything
 * gone wrong, when is the show, what have we got on this week, what have I
 * been told, what can I sign up for, who are these people.
 */
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

  const [
    productions,
    classes,
    notifications,
    posts,
    staff,
    offerings,
    familyEvents,
  ] = await Promise.all([
    provider.getProductions(),
    provider.getClasses(),
    provider.getNotifications(user.id),
    provider.getFeedForUser(user.id),
    provider.getStaffProfiles(),
    provider.listOpenOfferings(),
    user.familyId
      ? provider.getFamilyCalendar(user.id, user.familyId)
      : isStaff
        ? (provider.getAllEvents(user.id) as Promise<FamilyCalendarEvent[]>)
        : Promise.resolve<FamilyCalendarEvent[]>([]),
  ]);

  const active = enrollments.filter((e) => e.status !== "withdrawn");
  const balanceCents = active.reduce((sum, e) => sum + e.balanceCents, 0);
  const firstName = user.displayName.split(" ")[0];
  const today = todayKey();

  const unread = notifications.filter((n) => !n.readAt);
  /*
   * A broadcast is what gets sent when something changes for everybody at
   * once — a closure, a venue move, a cancelled night. Unread ones come out of
   * the list and go to the top of the page; once read they take their place in
   * the ordinary run of notifications like anything else.
   */
  const alerts: AppNotification[] = unread.filter((n) => n.type === "broadcast");

  /*
   * The shows this family is in, soonest first, and how long until each opens.
   * A show with no opening date on record contributes no countdown rather than
   * a guessed one — "in 9999 days" is not a thing to print on a dashboard.
   */
  const nowIso = new Date().toISOString();
  const myShows = [...new Set(active.map((e) => e.productionId).filter(Boolean))]
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
    .sort((a, b) => (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER));

  /** The next show still ahead of us — a run under way is not a countdown. */
  const nextShow = myShows.find((show) => show.days !== null && show.days >= 0);
  const showRunning = myShows.some((show) => show.days !== null && show.days < 0);

  return (
    <>
      {/* Above everything, deliberately — the same place the staff portal puts
          "We Care". The first thing on the page should be the thing that
          outranks everything else on it. */}
      <MissionPlaque />
      <TipOfTheDay />

      <AlertBand alerts={alerts} />

      <SectionHeader
        as="h1"
        title={firstName ? `Good to see you, ${firstName}` : "Dashboard"}
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
            Full calendar <ArrowRight aria-hidden size={14} />
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={nextShow ? `${nextShow.production.title} opens` : "Next show"}
          value={
            nextShow
              ? nextShow.days === 0
                ? "Tonight"
                : nextShow.days === 1
                  ? "Tomorrow"
                  : nextShow.days
              : showRunning
                ? "Now"
                : "—"
          }
          hint={
            nextShow
              ? nextShow.days === 0 || nextShow.days === 1
                ? "Break a leg"
                : "days away"
              : showRunning
                ? "The run is under way"
                : "No show booked yet"
          }
          tone={nextShow && nextShow.days !== null && nextShow.days <= 7 ? "warn" : "default"}
          href={nextShow ? `/productions/${nextShow.production.id}` : "/shows"}
        />
        <StatTile
          label="Balance due"
          value={balanceCents > 0 ? `$${(balanceCents / 100).toFixed(2)}` : "$0.00"}
          hint={balanceCents > 0 ? "Payment outstanding" : "Nothing outstanding"}
          tone={balanceCents > 0 ? "warn" : "good"}
        />
        <StatTile
          label="Unread notifications"
          value={unread.length}
          hint={unread.length ? "Waiting for you" : "You're all caught up"}
          tone={unread.length > 0 ? "warn" : "good"}
          href="/notifications"
        />
        <StatTile
          label="Students enrolled"
          value={students.length}
          hint={`${active.length} active ${active.length === 1 ? "enrollment" : "enrollments"}`}
          href="/family"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* The week, at the top and two columns wide, because it is the thing
            the page is for. Everything on it is here because this family is
            registered for it — one child's Sweeney calls and another's Tuesday
            class, merged, in one place. */}
        <div className="lg:col-span-2">
          <Card pad={false}>
            <WeekCalendar
              events={familyEvents}
              students={students.map((student) => ({
                id: student.id,
                name: student.preferredName ?? student.firstName,
              }))}
            />
            <div className="border-t px-4 py-2 text-center">
              <Link
                href="/schedule"
                className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <CalendarDays aria-hidden size={13} />
                Month view, conflicts, and add to your own calendar
                <ArrowRight aria-hidden size={13} />
              </Link>
            </div>
          </Card>
        </div>

        <NotificationsPanel
          notifications={notifications.slice(0, 5)}
          unreadCount={unread.length}
        />

        <div className="lg:col-span-2">
          <NewsPanel posts={posts.slice(0, 3)} />
        </div>

        <RegisterPanel offerings={offerings} />

        {/* Spirit buttons and star pages, on the dashboard rather than only
            behind the Store group (Tony, 17 Aug 2026). Both are impulse buys
            tied to a show a family is already looking at, and a menu heading
            two clicks away is where an impulse goes to die. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
          <Link
            href="/store/buttons"
            className="gold-hover flex items-start gap-3 rounded-lg border bg-card p-4 shadow-[var(--shadow-card)] transition-colors"
          >
            <span className="gold-band inline-flex size-9 shrink-0 items-center justify-center rounded-md border">
              <BadgeCheck aria-hidden size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold">Spirit buttons</span>
              <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                Pick a show, add a photo, see the button before you order.
              </span>
            </span>
          </Link>

          <Link
            href="/store/star-pages"
            className="gold-hover flex items-start gap-3 rounded-lg border bg-card p-4 shadow-[var(--shadow-card)] transition-colors"
          >
            <span className="gold-band inline-flex size-9 shrink-0 items-center justify-center rounded-md border">
              <Star aria-hidden size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold">Star pages</span>
              <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                A playbill tribute to your performer, from the whole family.
              </span>
            </span>
          </Link>
        </div>

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

        <StaffHighlight staff={staff} dayKey={today} />

        {user.familyId && (
          <div className="lg:col-span-3">
            <EnrollmentsCard
              enrollments={enrollments}
              students={students}
              productions={productions}
              classes={classes}
            />
          </div>
        )}

        {myShows.length > 0 && (
          <div className="lg:col-span-3">
            <Card pad={false}>
              <SectionHeader
                title={myShows.length === 1 ? "Your show" : "Your shows"}
                inCard
                right={
                  <Link
                    href="/shows"
                    className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    All shows <ArrowRight aria-hidden size={13} />
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
