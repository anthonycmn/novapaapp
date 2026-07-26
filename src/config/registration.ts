/**
 * Registration configuration (#8).
 *
 * SYNC SOURCE OF RECORD: the org's own custom-built registration system.
 * Its schema/API details are still to come, so the app syncs through the
 * `RegistrationProvider` interface with a mock adapter active by default.
 * When the real details arrive, implement one adapter (custom.ts) and flip
 * REGISTRATION_API_URL — nothing else in the app changes.
 *
 * DEEP-LINK DESTINATIONS: the live public site
 * (Desktop/NOVAPA WEB 7-16) currently sends families to two commercial
 * platforms for signup, so those URLs are recorded here for "register" and
 * "pay a balance" links. They are link targets only — not sync sources:
 *
 *   • Sawyer  (hisawyer.com) — classes, camps, on-stage programs
 *   • RegPack (regpack.com)  — coaching registration, embedded as an iframe
 *
 * Confirm with Tony which of these the custom system replaces before these
 * links ship to families. See NEEDS-FROM-TONY.md #8.
 */

export const registration = {
  sawyer: {
    orgSlug: "nova-performing-arts",
    locationId: "202081",
    /** Public schedules page — deep link target for new signups. */
    schedulesUrl:
      "https://www.hisawyer.com/nova-performing-arts/schedules?location_id%5B%5D=202081",
    /** Where families manage their own account and balances. */
    parentAccountUrl: "https://www.hisawyer.com/users/sign_in",
    /** Deep link to a specific offering. */
    activitySetUrl: (activitySetId: string) =>
      `https://www.hisawyer.com/nova-performing-arts/schedules/activity-set/${activitySetId}`,
    campsUrl:
      "https://www.hisawyer.com/nova-performing-arts/schedules?location_id%5B%5D=202081&schedule_id=camps&widget_tags=summer+camp",
  },

  regpack: {
    /** Group id from the coaching-registration.html iframe embed. */
    groupId: "100920141",
    coachingUrl: "https://www.northernvirginiaperformingarts.org/coaching-registration",
  },

  /** Public registration landing page on the main site. */
  registrationLandingUrl:
    "https://www.northernvirginiaperformingarts.org/novapa_registration",
  classesUrl: "https://www.northernvirginiaperformingarts.org/classes",
} as const;
