import type { StaffProfile } from "../types";

/**
 * The coaches a family may book, assembled from BOTH systems.
 *
 * Coaching is the staff portal's business (portal 0011) and it stays there:
 * the portal decides who coaches, what they coach, whether they are taking
 * new students, and whether they are offered at all. What the portal
 * deliberately does NOT hold is the bio — `family_hub.staff_profiles` has
 * carried bios, photographs, specialties and credits since long before
 * coaching wanted them, complete with the approval queue that releases them.
 *
 * So a coach is a join of the two halves, done here in TypeScript rather than
 * in a cross-schema view, for the same reason portal 0011 and 0087 refused a
 * foreign key across the boundary: it would hard-couple two systems that are
 * deliberately separable, and the hub already joins the portal's coaching
 * catalog to its own rows exactly this way.
 *
 * A COACH REACHES A PARENT ONLY WHEN BOTH HALVES SAY YES — offered as a coach
 * in the portal, and their bio published here. Either alone is a half-written
 * page, and a half-written page about a person a parent is deciding to trust
 * with their child is worse than no page.
 *
 * Nothing about pay crosses this boundary. `v_coaching_coaches_public` carries
 * no rate, no share percentage, no client and no session, by design.
 *
 * This module is deliberately free of any server-only import: it is the rule,
 * not the fetch, so it can be tested directly (tests/coaches.test.ts).
 */
export interface Coach {
  /** `staff_portal.staff.id` — the id all three systems agree on. */
  staffId: string;
  /** URL segment: /coaches/<slug>. */
  slug: string;
  /** Their name as the portal holds it (preferred name where they gave one). */
  name: string;
  /** The line under the name. Falls back to their staff title. */
  headline: string;
  videoUrl?: string;
  acceptingNew: boolean;
  /** Internal routing list: voice, acting, dance, audition. */
  disciplines: string[];
  /** How the coach's diary is offered — see `generateSlots`. */
  sessionMinutes: number;
  noticeHours: number;
  horizonDays: number;
  /** The bio half — photograph, paragraph, specialties, credits. */
  profile: StaffProfile;
}

/** A row of `staff_portal.v_coaching_coaches_public`, untrusted and untyped. */
export interface PortalCoachRow {
  staff_id?: unknown;
  slug?: unknown;
  name?: unknown;
  headline?: unknown;
  video_url?: unknown;
  accepting_new?: unknown;
  sort_order?: unknown;
  disciplines?: unknown;
  session_minutes?: unknown;
  notice_hours?: unknown;
  horizon_days?: unknown;
}

export interface OfferedCoach {
  row: PortalCoachRow;
  sortOrder: number;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** A positive whole number from the view, or the coach-wide default. */
const int = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.trunc(v) : fallback;

/**
 * Join the portal's offered coaches to the hub's published bios.
 *
 * `profiles` is passed in rather than fetched so the caller can reuse the
 * staff read it has already made — the /coaches page needs both halves and
 * should not ask the database for the same bios twice.
 */
export function assembleCoaches(
  offered: OfferedCoach[],
  profiles: StaffProfile[]
): Coach[] {
  const byPortalId = new Map<string, StaffProfile>();
  for (const profile of profiles) {
    if (profile.portalStaffId) byPortalId.set(profile.portalStaffId, profile);
  }

  const coaches: Array<{ coach: Coach; sortOrder: number }> = [];
  for (const { row, sortOrder } of offered) {
    const staffId = str(row.staff_id);
    const slug = str(row.slug);
    if (!staffId || !slug) continue;

    // The bio half. No published bio, no card: see the note above about
    // half-written pages.
    const profile = byPortalId.get(staffId);
    if (!profile || !profile.isPublished) continue;

    coaches.push({
      sortOrder,
      coach: {
        staffId,
        slug,
        name: str(row.name) ?? profile.fullName,
        headline: str(row.headline) ?? profile.title,
        videoUrl: str(row.video_url),
        acceptingNew: row.accepting_new !== false,
        disciplines: Array.isArray(row.disciplines)
          ? (row.disciplines as unknown[]).filter(
              (d): d is string => typeof d === "string"
            )
          : [],
        sessionMinutes: int(row.session_minutes, 60),
        // Notice may legitimately be zero, so it cannot use the positive-only
        // reader: a coach happy to be booked an hour from now is allowed.
        noticeHours:
          typeof row.notice_hours === "number" && Number.isFinite(row.notice_hours)
            ? Math.max(0, Math.trunc(row.notice_hours))
            : 24,
        horizonDays: int(row.horizon_days, 42),
        profile,
      },
    });
  }

  return coaches
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.coach.name.localeCompare(b.coach.name)
    )
    .map((entry) => entry.coach);
}
