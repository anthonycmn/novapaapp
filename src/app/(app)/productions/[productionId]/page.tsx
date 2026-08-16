import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Bell, Images, Megaphone, ShoppingBag, Ticket } from "lucide-react";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import type { CalendarEvent } from "@/lib/api/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatTile } from "@/components/ui/stat-tile";
import { ComingSoonCards, WhoToEmail } from "@/components/productions/who-to-email";
import { RehearsalTracks } from "@/components/productions/rehearsal-tracks";
import { ScenesAndSongs } from "@/components/productions/scenes-and-songs";
import { ScheduleRail } from "@/components/productions/schedule-rail";

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

  const [staff, templates, allEvents] = await Promise.all([
    provider.getStaffProfiles(),
    provider.getButtonTemplates(productionId),
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

  const opensAt = production.opensOn ? `${production.opensOn}T12:00:00Z` : null;
  const daysToOpening = opensAt
    ? Math.ceil((new Date(opensAt).getTime() - Date.now()) / 86_400_000)
    : null;

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

      {/* ---- Where the show is, at a glance ---- */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={daysToOpening !== null && daysToOpening < 0 ? "Opened" : "Opening night"}
          value={
            daysToOpening === null
              ? "TBC"
              : daysToOpening < 0
                ? "Run under way"
                : daysToOpening === 0
                  ? "Tonight"
                  : `${daysToOpening} days`
          }
          hint={opensAt ? formatDate(opensAt) : "Date not set"}
          tone={daysToOpening !== null && daysToOpening <= 14 ? "warn" : "default"}
        />
        <StatTile
          label="Next call"
          value={nextCall ? formatDate(nextCall.startsAt) : "—"}
          hint={nextCall ? nextCall.title : "Nothing on your calendar yet"}
        />
        <StatTile
          label="Calls remaining"
          value={upcoming.length}
          hint={`${events.length} on your family's calendar in total`}
          href="/schedule"
        />
        <StatTile
          label="Venue"
          value={production.venue.split(",")[0]}
          hint="Check each call — this show moves buildings mid-run"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---- Left: what a parent reads ---- */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          {isSweeney && <RehearsalTracks />}

          <Card pad={false}>
            <SectionHeader title="Keeping up with the show" inCard />
            <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <Tile
                href="/feed"
                Icon={Megaphone}
                title="Live updates"
                body="Posts from the directors, and answers to what families ask"
              />
              <Tile
                href="/photos"
                Icon={Images}
                title="Photos"
                body="Rehearsal and performance galleries"
              />
              <Tile
                href="/store"
                Icon={ShoppingBag}
                title="Buttons & star pages"
                body={
                  templates.length > 0
                    ? "Design a spirit button for your performer"
                    : "Opening soon for this show"
                }
              />
              <Tile
                href="/notifications/settings"
                Icon={Bell}
                title="Notifications"
                body="Choose what we tell you about, and when"
              />
            </div>
          </Card>

          {isSweeney && <ScenesAndSongs />}

          <WhoToEmail />

          <ComingSoonCards />

          {director && (
            <Card pad={false}>
              <SectionHeader title="Creative team" inCard />
              <div className="p-4">
                <Link
                  href={`/staff/${director.id}`}
                  className="inline-flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted"
                >
                  <Avatar
                    name={director.fullName}
                    src={director.photoUrl}
                    className="size-8 text-[11px]"
                  />
                  <span>
                    <span className="block text-[13px] font-medium">
                      {director.fullName}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">
                      Director
                    </span>
                  </span>
                </Link>
              </div>
            </Card>
          )}

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

function Tile({
  href,
  Icon,
  title,
  body,
}: {
  href: string;
  Icon: typeof Bell;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted"
    >
      <Icon aria-hidden size={15} className="mt-0.5 shrink-0 text-gold" />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
          {body}
        </span>
      </span>
    </Link>
  );
}
