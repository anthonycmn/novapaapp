/**
 * Productions whose schedule comes from an iCal feed rather than the staff
 * portal's season plan.
 *
 * Tony, 17 Aug 2026: "I want you to look at the Calendar through iCal — not
 * the curriculum page — so that when I update it automatically updates."
 *
 * A production listed here has exactly ONE writer: the hourly iCal sync. The
 * portal sync skips it entirely (see syncPortalSchedule), because two writers
 * on one show's calendar means families see every call twice.
 *
 * SECURITY: a Google "private address" ICS URL is a bearer token — anyone
 * holding it can read that calendar. Set it in Netlify env vars, NOT here.
 * A feed with no URL configured is skipped and reported, rather than silently
 * doing nothing.
 */
export interface IcalFeed {
  /** Stored as calendar_events.external_source; the sync owns only its own. */
  key: string;
  /** family_hub.productions.id this feed populates. */
  productionId: string;
  /** Absolute https ICS URL, from the environment. */
  url?: string;
  /** Stripped off the front of every event title, e.g. "Sweeney Todd - ". */
  titlePrefix?: RegExp;
  /**
   * Call-sheet shorthand the show calendar uses that does not match the role
   * name on its own. The sync already resolves "Anthony" to Anthony Hope and
   * "Pirelli" to Adolfo Pirelli by prefix and suffix; only names that share no
   * word with the role need spelling out here.
   */
  roleAliases?: Record<string, string>;
}

export const ICAL_FEEDS: IcalFeed[] = [
  {
    key: "sweeney_ics",
    productionId: "2f57e4a1-c61c-415e-b755-1212709ef141",
    url: process.env.SWEENEY_ICS_URL,
    titlePrefix: /^Sweeney Todd\s*[-–—]\s*/i,
    roleAliases: { Toby: "Tobias Ragg" },
  },
];

/** Production ids the portal sync must leave alone. */
export const ICAL_OWNED_PRODUCTION_IDS = new Set(
  ICAL_FEEDS.map((feed) => feed.productionId)
);
