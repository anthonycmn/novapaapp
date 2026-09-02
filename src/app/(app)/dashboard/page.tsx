import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BadgeCheck, CalendarDays, Star } from "lucide-react";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import { registration } from "@/config/registration";
import { todayKey } from "@/lib/calendar/week";
import { daysUntil, openingNight } from "@/lib/api/productions/run";
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
import { DashboardArranger, type ArrangerTile } from "@/components/dashboard/arranger";
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
 * It replaced a home page that summarized the portal and a "This week" group
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
 *
 * ---------------------------------------------------------------------------
 * …and then the order is theirs (0060)
 * ---------------------------------------------------------------------------
 * CJ, 2 Sep 2026: "allow me to move around my dashboard the same way we did
 * for the staff portal." So that order is now only the DEFAULT. Everything
 * below the stat row is handed to <DashboardArranger/> as a finished panel with
 * a name and a starting column, and where it actually sits is whatever this
 * account last decided.
 *
 * What stays put: the mission plaque, the tip, the alert band, the greeting and
 * the four stats. The plaque is the same argument as the staff portal's "We
 * Care" — a masthead you can drag under the store links is not a masthead — and
 * an alert about a canceled night has to be above the fold whoever is reading.
 *
 * Every panel here is rendered on the SERVER, for this account, from data the
 * provider already checked. The arranger is handed finished output and only
 * decides where it goes, so no arrangement of a saved layout can reach anything
 * this page did not already fetch for the person reading it.
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
    runs,
    classes,
    notifications,
    posts,
    staff,
    offerings,
    familyEvents,
    callResponses,
    layout,
  ] = await Promise.all([
    provider.getProductions(),
    provider.getProductionRuns(),
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
    // What this family has already said about each call — 0049. Drawn on the
    // card itself, because the place you confirm you told somebody should be
    // the place you told them.
    provider.getMyCallResponses(user.id),
    provider.getDashboardLayout(user.id),
  ]);

  const active = enrollments.filter((e) => e.status !== "withdrawn");
  const balanceCents = active.reduce((sum, e) => sum + e.balanceCents, 0);
  const firstName = user.displayName.split(" ")[0];
  const today = todayKey();

  const unread = notifications.filter((n) => !n.readAt);
  /*
   * A broadcast is what gets sent when something changes for everybody at
   * once — a closure, a venue move, a canceled night. Unread ones come out of
   * the list and go to the top of the page; once read they take their place in
   * the ordinary run of notifications like anything else.
   */
  const alerts: AppNotification[] = unread.filter((n) => n.type === "broadcast");

  /*
   * The shows this family is in, soonest first, and how long until each opens.
   *
   * Opening night comes off the CALENDAR, not productions.opensOn — that
   * column is null on every one of the twenty-four, so reading it alone made
   * this tile say "no show booked yet" to a family whose child opens in six
   * weeks. A show with genuinely nothing scheduled still contributes no
   * countdown, which is the honest case.
   */
  const nowIso = new Date().toISOString();
  const myShows = [...new Set(active.map((e) => e.productionId).filter(Boolean))]
    .map((productionId) => {
      const production = productions.find((p) => p.id === productionId);
      if (!production) return null;
      const nextCall = familyEvents
        .filter((e) => e.productionId === production.id && e.endsAt >= nowIso)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      const days = daysUntil(openingNight(production, runs[production.id]));
      return { production, nextCall, days };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER));

  /** The next show still ahead of us — a run under way is not a countdown. */
  const nextShow = myShows.find((show) => show.days !== null && show.days >= 0);
  const showRunning = myShows.some((show) => show.days !== null && show.days < 0);

  /*
   * The arrangeable half of the page.
   *
   * A tile is only in this list when the page actually has something to put in
   * it — no family, no enrollments card; no shows, no shows panel. That is what
   * keeps "arrangement, never access" true at the registry level as well as in
   * the layout: a saved layout can name a panel all it likes, and if this
   * account has no business seeing one it is not in the list to be placed.
   */
  const tiles: ArrangerTile[] = [
    {
      def: {
        key: "week",
        title: "This week",
        blurb: "Every call and class your children are in, merged into one week.",
        zone: "left",
      },
      node: (
        <Card pad={false}>
          <WeekCalendar
            events={familyEvents}
            responses={callResponses}
            canRespond={Boolean(user.familyId)}
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
      ),
    },
    {
      def: {
        key: "notifications",
        title: "Notifications",
        blurb: "The five most recent things we have told you.",
        zone: "right",
      },
      node: (
        <NotificationsPanel
          notifications={notifications.slice(0, 5)}
          unreadCount={unread.length}
        />
      ),
    },
    {
      def: {
        key: "news",
        title: "News",
        blurb: "The latest posts from the company feed.",
        zone: "left",
      },
      node: <NewsPanel posts={posts.slice(0, 3)} />,
    },
    {
      def: {
        key: "register",
        title: "Open for registration",
        blurb: "Classes, camps and shows you can still sign up for.",
        zone: "right",
      },
      node: <RegisterPanel offerings={offerings} />,
    },
    {
      def: {
        key: "store",
        title: "Spirit buttons & star pages",
        blurb: "The two things families buy for a show they are already in.",
        zone: "left",
      },
      /* On the dashboard rather than only behind the Store group (Tony,
         17 Aug 2026). Both are impulse buys tied to a show a family is already
         looking at, and a menu heading two clicks away is where an impulse goes
         to die. */
      node: (
        <div className="grid gap-3 sm:grid-cols-2">
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
      ),
    },
    ...(students.length > 0
      ? [
          {
            def: {
              key: "students",
              title: "Your students",
              blurb: "Your children, and the way into each one's profile.",
              zone: "left" as const,
            },
            node: (
              <Card pad={false}>
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
            ),
          },
        ]
      : []),
    {
      def: {
        key: "staff",
        title: "Meet the team",
        blurb: "One of the people your child works with, every day a different one.",
        zone: "right",
      },
      node: <StaffHighlight staff={staff} dayKey={today} />,
    },
    ...(user.familyId
      ? [
          {
            def: {
              key: "enrollments",
              title: "Enrollments",
              blurb: "What each child is registered for, and what is owed.",
              zone: "top" as const,
            },
            node: (
              <EnrollmentsCard
                enrollments={enrollments}
                students={students}
                productions={productions}
                classes={classes}
              />
            ),
          },
        ]
      : []),
    ...(myShows.length > 0
      ? [
          {
            def: {
              key: "shows",
              title: myShows.length === 1 ? "Your show" : "Your shows",
              blurb: "The shows your children are in, and the next call in each.",
              zone: "top" as const,
            },
            node: (
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
            ),
          },
        ]
      : []),
  ];

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
          hint={balanceCents > 0 ? "Tap to pay in your account" : "Nothing outstanding"}
          tone={balanceCents > 0 ? "warn" : "good"}
          /*
           * Balances are owed to the registration system and paid there —
           * that is where the money and the ledger both live, so paying here
           * would leave a family chased for what they had already settled.
           * The tile says what is owed and hands them straight to it.
           */
          href={balanceCents > 0 ? registration.parentAccountUrl : undefined}
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

      <DashboardArranger tiles={tiles} saved={layout} />
    </>
  );
}
