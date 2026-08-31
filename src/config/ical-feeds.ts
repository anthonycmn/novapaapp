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
  /**
   * Names that appear on a call line but are NOT characters — the staff member
   * running the room, written as "… with Ryyana".
   *
   * Listed rather than inferred. The free-form call sheet puts staff, rooms,
   * numbers and characters on one line, and the only safe way to tell a
   * director from a role is to say so.
   */
  staffNames?: string[];
  /**
   * Corrections to the address the feed supplies, first match wins.
   *
   * The feed is the source of truth for WHEN; it has been unreliable about
   * WHERE. Editing the row instead does not hold — the sync rewrites location
   * every hour, which silently reverted a corrected address twice. Fixing it
   * here means the correction survives, and one edit covers every call at
   * that venue rather than thirty-odd calendar entries.
   *
   * Matched against the feed's own location text, so a production that moves
   * venue mid-run keeps its later address untouched.
   */
  locationRewrites?: Array<{ when: RegExp; use: string }>;
}

export const ICAL_FEEDS: IcalFeed[] = [
  {
    key: "sweeney_ics",
    productionId: "2f57e4a1-c61c-415e-b755-1212709ef141",
    url: process.env.SWEENEY_ICS_URL,
    titlePrefix: /^Sweeney Todd\s*[-–—]\s*/i,
    /*
     * "Toby" shares no word with Tobias Ragg. "Passer-by" is not a role at all:
     * Tony, 31 Aug 2026, confirmed it is played by the Ensemble, so it resolves
     * there rather than being dropped — an ensemble member reading the 26 Sep
     * call must still see it.
     */
    roleAliases: {
      Toby: "Tobias Ragg",
      "Passer-by": "Ensemble of London",
      "Passer by": "Ensemble of London",
      Passerby: "Ensemble of London",
    },
    staffNames: ["Colton", "Ryyana", "Ava"],
    /*
     * Tony, 23 Aug 2026, definitively: rehearsals are 18945 Conference Center
     * Drive, Leesburg VA 20175 — park in the south lot. The feed had the wrong
     * zip (20176) and carried "Plaza C", which belongs to the auditorium.
     *
     * Anchored on "Rehearsal Space" so the performance venue, which the feed
     * gets right from the costume parade on 4 Oct, is left alone.
     */
    locationRewrites: [
      {
        when: /^Rehearsal Space/i,
        use: "Rehearsal Space, South Building, National Conference Center, 18945 Conference Center Drive, Leesburg VA 20175 — park in the south lot",
      },
    ],
  },
];

/** Production ids the portal sync must leave alone. */
export const ICAL_OWNED_PRODUCTION_IDS = new Set(
  ICAL_FEEDS.map((feed) => feed.productionId)
);
