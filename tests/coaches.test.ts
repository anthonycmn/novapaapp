import { describe, expect, it } from "vitest";
import { assembleCoaches } from "@/lib/api/coaching/assemble";
import type { StaffProfile } from "@/lib/api/types";

/**
 * A coach is a join of two systems that can each say no.
 *
 * The staff portal decides who is OFFERED as a coach; the family hub decides
 * whose bio is PUBLISHED. Both must agree before a parent sees a card, and the
 * failure that matters is the quiet one: a coach offered by the portal whose
 * bio nobody has released yet, rendering as a nameless card with an empty
 * paragraph on the page a parent uses to choose who coaches their child.
 *
 * These tests pin that rule, and the fallbacks that keep a card readable when
 * only some of the optional fields are filled in.
 */

/** A row exactly as staff_portal.v_coaching_coaches_public returns one. */
const offered = (patch: Record<string, unknown> = {}) => ({
  row: {
    staff_id: "staff-1",
    slug: "ryyana-cunningham",
    name: "Ryyana Cunningham",
    headline: "Voice & audition coach",
    video_url: null,
    accepting_new: true,
    sort_order: 100,
    disciplines: ["voice", "audition"],
    ...patch,
  },
  sortOrder: typeof patch.sort_order === "number" ? patch.sort_order : 100,
});

/** A row as family_hub.staff_profiles returns one, already mapped. */
const profile = (patch: Partial<StaffProfile> = {}): StaffProfile => ({
  id: "profile-1",
  portalStaffId: "staff-1",
  fullName: "Ryyana Cunningham",
  title: "Teaching Artist",
  bio: "Fifteen years of music direction.",
  specialties: ["Belt technique"],
  isPublished: true,
  ...patch,
});

describe("assembleCoaches", () => {
  it("joins the portal's coach to the hub's bio on portalStaffId", () => {
    const [coach] = assembleCoaches([offered()], [profile()]);
    expect(coach.name).toBe("Ryyana Cunningham");
    expect(coach.profile.bio).toBe("Fifteen years of music direction.");
    expect(coach.disciplines).toEqual(["voice", "audition"]);
  });

  it("drops a coach whose bio is not published", () => {
    // The failure this whole file exists for: offered by the portal, but no
    // administrator has released the bio. A half-written page about a person
    // a parent is deciding to trust is worse than no page.
    expect(assembleCoaches([offered()], [profile({ isPublished: false })])).toEqual([]);
  });

  it("drops a coach who has no bio in the hub at all", () => {
    expect(assembleCoaches([offered()], [])).toEqual([]);
    // ...and a profile belonging to somebody else must not be borrowed.
    expect(
      assembleCoaches([offered()], [profile({ portalStaffId: "someone-else" })])
    ).toEqual([]);
  });

  it("falls back to the staff title when there is no coaching headline", () => {
    const [coach] = assembleCoaches([offered({ headline: null })], [profile()]);
    expect(coach.headline).toBe("Teaching Artist");
  });

  it("sorts by the portal's order, then by name", () => {
    const coaches = assembleCoaches(
      [
        offered({ staff_id: "b", slug: "b", name: "Zoe", sort_order: 10 }),
        offered({ staff_id: "a", slug: "a", name: "Adam", sort_order: 50 }),
        offered({ staff_id: "c", slug: "c", name: "Casey", sort_order: 10 }),
      ],
      [
        profile({ id: "a", portalStaffId: "a" }),
        profile({ id: "b", portalStaffId: "b" }),
        profile({ id: "c", portalStaffId: "c" }),
      ]
    );
    expect(coaches.map((c) => c.name)).toEqual(["Casey", "Zoe", "Adam"]);
  });

  it("treats a missing accepting_new as still taking students", () => {
    const [coach] = assembleCoaches([offered({ accepting_new: null })], [profile()]);
    expect(coach.acceptingNew).toBe(true);
    const [full] = assembleCoaches([offered({ accepting_new: false })], [profile()]);
    expect(full.acceptingNew).toBe(false);
  });

  it("ignores a row with no slug, which could not be linked to anyway", () => {
    expect(assembleCoaches([offered({ slug: null })], [profile()])).toEqual([]);
  });

  it("never exposes a rate, however the portal row is shaped", () => {
    // Belt and braces: the view is defined without pay columns, and this
    // asserts nothing downstream re-introduces one by spreading the row.
    const [coach] = assembleCoaches(
      [offered({ hourly_rate: 65, coach_share_pct: 70 })],
      [profile()]
    );
    expect(JSON.stringify(coach)).not.toContain("65");
    expect(JSON.stringify(coach)).not.toContain("hourly_rate");
  });
});
