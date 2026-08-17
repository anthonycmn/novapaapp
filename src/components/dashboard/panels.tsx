import Link from "next/link";
import {
  ArrowRight,
  Bell,
  ExternalLink,
  Megaphone,
  Siren,
  Ticket,
} from "lucide-react";
import { org } from "@/config/org";
import { registration } from "@/config/registration";
import { groupOfferings, type OpenOffering } from "@/lib/api/catalog/offerings";
import type { AppNotification, FeedPost, StaffProfile } from "@/lib/api/types";
import { formatCents, formatEventTime } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * The panels the dashboard is made of. Server components — none of this is
 * interactive, and a parent opening the portal should get the whole page in
 * one render rather than five spinners.
 */

/* ── Emergency ──────────────────────────────────────────────────────────── */

/**
 * Alerts, above everything.
 *
 * A broadcast is what the org sends when something has changed for everybody
 * at once — a venue moved, a night cancelled, a closure. It is the only kind
 * of notification that must not wait to be scrolled to, so unread ones are
 * lifted out of the notification list and put at the top of the page in a
 * colour nothing else on the page uses.
 *
 * Deliberately NOT dismissible here. Reading it is what clears it, on the
 * notifications page, and a parent tapping an X on a closure notice at a
 * traffic light is not the same as having read it.
 */
export function AlertBand({ alerts }: { alerts: AppNotification[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="mb-4 flex flex-col gap-2">
      {alerts.map((alert) => (
        <a
          key={alert.id}
          href={`/api/notifications/go/${alert.id}`}
          className="flex items-start gap-3 rounded-lg border-2 border-destructive bg-destructive/10 p-3.5 transition-opacity hover:opacity-90"
        >
          <Siren aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-destructive">{alert.title}</p>
            <p className="text-[13px]">{alert.body}</p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              {formatEventTime(alert.createdAt)}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}

/* ── News ───────────────────────────────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
  casting: "Casting",
  rehearsal: "Rehearsal",
  fundraising: "Fundraising",
  show_week: "Show Week",
  celebration: "Celebration",
  general: "News",
};

/** The last few announcements, with the full post one tap away. */
export function NewsPanel({ posts }: { posts: FeedPost[] }) {
  return (
    <Card pad={false}>
      <SectionHeader
        title="News"
        inCard
        right={
          <Link
            href="/feed"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            All news <ArrowRight aria-hidden size={13} />
          </Link>
        }
      />
      {posts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center">
          <Megaphone aria-hidden className="size-7 text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">
            Casting news, rehearsal updates and show-week info will land here.
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href="/feed" className="block px-4 py-2.5 hover:bg-muted">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {CATEGORY_LABELS[post.category] ?? post.category}
                  </Badge>
                  {post.isPinned && (
                    <span className="text-[11px] font-medium text-gold">Pinned</span>
                  )}
                </div>
                {post.title && (
                  <p className="mt-1 text-[13px] font-medium">{post.title}</p>
                )}
                {/* Two lines of the post, so the headline is not the only
                    thing a parent can judge it by. */}
                <p className="line-clamp-2 text-[12.5px] text-muted-foreground">
                  {post.body}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {post.authorName} · {formatEventTime(post.publishedAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Notifications ──────────────────────────────────────────────────────── */

export function NotificationsPanel({
  notifications,
  unreadCount,
}: {
  notifications: AppNotification[];
  unreadCount: number;
}) {
  return (
    <Card pad={false}>
      <SectionHeader
        title="Notifications"
        inCard
        right={
          <Link
            href="/notifications"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            {unreadCount > 0 ? `${unreadCount} unread` : "All"}{" "}
            <ArrowRight aria-hidden size={13} />
          </Link>
        }
      />
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center">
          <Bell aria-hidden className="size-7 text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">
            Schedule changes, casting news and photos of your child show up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {notifications.map((notification) => (
            <li key={notification.id}>
              {/* Following a notification is what marks it read — the same
                  route the notifications page uses, so the two agree. */}
              <a
                href={`/api/notifications/go/${notification.id}`}
                className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-muted"
              >
                {!notification.readAt && (
                  <span
                    aria-label="Unread"
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{notification.title}</p>
                  <p className="line-clamp-2 text-[12.5px] text-muted-foreground">
                    {notification.body}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {formatEventTime(notification.createdAt)}
                  </p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Register & tickets ─────────────────────────────────────────────────── */

/**
 * What is open right now, straight from the org's catalogue.
 *
 * Every row here is something that can actually be bought this minute: the
 * catalogue's own active/bookable/not-hidden flags decide, and anything with
 * no places left is filtered out before it reaches this component. A
 * "Register" button that lands on a full week is worse than no button.
 *
 * The counts are honest too. There are over a hundred open offerings and this
 * is a dashboard, so each kind shows three and says how many more there are,
 * rather than showing three and implying that is all of them.
 */
export function RegisterPanel({ offerings }: { offerings: OpenOffering[] }) {
  const groups = groupOfferings(offerings);

  return (
    <Card pad={false}>
      <SectionHeader
        title="Sign up for something"
        inCard
        right={
          <a
            href={registration.registrationLandingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Everything <ExternalLink aria-hidden size={12} />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        }
      />

      <div className="flex flex-col gap-3 p-4">
        {groups.length === 0 ? (
          <p className="text-center text-[13px] text-muted-foreground">
            Nothing open for registration at the moment. New classes and camps
            are announced in News.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.kind}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <ul className="flex flex-col gap-1.5">
                {group.shown.map((offering) => (
                  <li key={offering.activityId}>
                    <a
                      href={offering.registerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">
                          {offering.name}
                        </span>
                        <span className="block text-[11.5px] text-muted-foreground">
                          {[
                            offering.ageRange,
                            offering.priceCents !== undefined
                              ? formatCents(offering.priceCents)
                              : null,
                            // Only worth saying when it is nearly gone.
                            offering.openSpots !== undefined && offering.openSpots <= 5
                              ? `${offering.openSpots} ${offering.openSpots === 1 ? "place" : "places"} left`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <ExternalLink
                        aria-hidden
                        size={13}
                        className="mt-0.5 shrink-0 text-muted-foreground"
                      />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
              {group.more > 0 && (
                <a
                  href={registration.registrationLandingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[12px] text-primary underline-offset-4 hover:underline"
                >
                  and {group.more} more {group.label.toLowerCase()}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </div>
          ))
        )}

        {/* Private lessons are booked in the portal rather than the
            catalogue, so the link goes where the booking actually is. */}
        <Link
          href="/store/lessons"
          className="rounded-md border px-3 py-2 text-center text-[13px] font-medium transition-colors hover:bg-muted"
        >
          Book a private lesson
        </Link>

        <a
          href={org.ticketsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Ticket aria-hidden size={14} />
          Buy show tickets
          <ExternalLink aria-hidden size={13} />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </Card>
  );
}

/* ── Staff highlight ────────────────────────────────────────────────────── */

/**
 * One colleague, with their bio.
 *
 * Which one rotates by the day rather than at random: random means a parent
 * who opens the portal twice in an afternoon sees two different people and
 * reads it as noise, and it also makes the page impossible to test. Same day,
 * same person, for everyone.
 */
export function StaffHighlight({
  staff,
  dayKey,
}: {
  staff: StaffProfile[];
  dayKey: string;
}) {
  const featured = pickForDay(staff, dayKey);
  if (!featured) return null;

  return (
    <Card pad={false}>
      <SectionHeader
        title="Meet the team"
        inCard
        right={
          <Link
            href="/staff"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            All staff <ArrowRight aria-hidden size={13} />
          </Link>
        }
      />
      <Link
        href={`/staff/${featured.id}`}
        className="flex gap-3 p-4 transition-colors hover:bg-muted"
      >
        <Avatar
          name={featured.fullName}
          src={featured.photoUrl}
          className="size-14 shrink-0 text-sm"
        />
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium">{featured.fullName}</p>
          <p className="text-[12px] text-muted-foreground">{featured.title}</p>
          {featured.bio && (
            <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed">
              {featured.bio}
            </p>
          )}
          {featured.specialties.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-1">
              {featured.specialties.slice(0, 3).map((specialty) => (
                <Badge key={specialty} variant="secondary">
                  {specialty}
                </Badge>
              ))}
            </p>
          )}
        </div>
      </Link>
    </Card>
  );
}

/**
 * Same day, same person — and every colleague comes up before anybody repeats,
 * because the rotation walks the list rather than hashing into it.
 */
export function pickForDay<T>(items: T[], dayKey: string): T | undefined {
  if (items.length === 0) return undefined;
  const days = Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86_400_000);
  return items[((days % items.length) + items.length) % items.length];
}
