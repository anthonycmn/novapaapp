/**
 * Who a family should email, and what for.
 *
 * Two hard rules, both enforced by tests/contacts.test.ts:
 *
 *  1. **Staff addresses only, always @novapa.org.** A production's paperwork
 *     is full of names — the Dear Evan Hansen strike sheet alone lists
 *     fourteen students by name against jobs. None of that belongs on a page
 *     769 families can read. Nothing here is a student, a parent, or a
 *     personal address. (Tony, 16 Aug 2026: "only staff email address".)
 *  2. **Every entry says what it is for.** A list of names and addresses
 *     makes a parent guess, and guessing means the allergy email goes to the
 *     director and sits unread for two days.
 *
 * Titles are the ones on each person's staff profile. Colton and Ryyana have
 * no published profile yet, so theirs come from the Sweeney master workbook,
 * which is explicit: Colton Sorensen is both Director and Vocal Director, and
 * Ryyana's room is "dance, movement, staging, transitions and violence only".
 * Colton's address was confirmed by Tony on 16 Aug 2026.
 */

export interface StaffContact {
  name: string;
  title: string;
  email: string;
  /** Plain-English "email this person when…" — never omit it. */
  forWhat: string;
}

/*
 * THE FIVE WHO ARE ON EVERY SHOW — CJ, 4 Sep 2026: "always include Katie
 * Rivers, Jason Jones, Jen Travis, Todd Cimino-Johnson, and Tony
 * Cimino-Johnson but each show should have a different 'who to contact' based
 * on the show's assigned staff."
 *
 * Colton Sorensen and Ryyana Cunningham used to sit in this list and were
 * therefore printed on the contact card of every production in the portal —
 * including the twenty-odd they have nothing to do with. They are Sweeney's
 * creative team. A parent of a Frozen KIDS five-year-old was being told to
 * email the Sweeney vocal director about "your child's track".
 *
 * They have not been deleted, only moved to where they belong: a show's own
 * team now comes from production_staff, per show, and appears above this list.
 * Colton appears on Sweeney because he is assigned to Sweeney.
 *
 * What stays here is the standing desks — the five people who answer for any
 * show in the building, whichever one your child is in.
 */
export const STAFF_CONTACTS: StaffContact[] = [
  {
    name: "Katie Rivers",
    title: "Director of Health & Safety",
    email: "katie@novapa.org",
    forWhat:
      "Allergies, medications, injuries, and anything about your child's wellbeing in the building.",
  },
  {
    name: "Todd Cimino-Johnson",
    title: "Chief Financial Officer",
    email: "todd@novapa.org",
    forWhat: "Invoices, balances, payment plans and FSA statements.",
  },
  {
    name: "Jason Jones",
    title: "Chief Technology Officer",
    email: "jason@novapa.org",
    forWhat: "Trouble signing in to this portal, or anything that looks broken.",
  },
  {
    name: "Jennifer Travis",
    title: "Family Engagement Coordinator",
    email: "jen@novapa.org",
    /*
     * Jen has the seat Zoe Schauder held here (Tony, 2 Sep 2026: "eliminate
     * Zoe on the parent side of the portal and replace her with Jen"). The
     * schedule topics sat on CJ for a few hours in between, and this list and
     * staff_portal.contact_routes have to agree — two lists disagreeing is how
     * a family emails somebody who is not expecting them — so
     * "Schedule or calendar question" and "How the day runs" now route to this
     * address in both places, alongside the registration, refund, building,
     * volunteering, accessibility and "something else" topics already hers.
     */
    forWhat:
      "Schedule and calendar questions, conflicts, registration, refunds, volunteering, and anything you are not sure who to ask.",
  },
  {
    name: "Tony Cimino-Johnson",
    title: "Chief Executive Officer",
    email: "cj@novapa.org",
    forWhat:
      "Anything unresolved, or a concern you would like taken further.",
  },
];

/** The domain every family-facing contact must be on. */
export const STAFF_EMAIL_DOMAIN = "@novapa.org";
