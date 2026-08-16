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
 * which is explicit: Colton Sorenson is both Director and Vocal Director, and
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

export const STAFF_CONTACTS: StaffContact[] = [
  {
    name: "Colton Sorenson",
    title: "Director & Vocal Director",
    email: "colton@novapa.org",
    forWhat:
      "The show itself — casting, music, what happens in a rehearsal, your child's track.",
  },
  {
    name: "Ryyana Cunningham",
    title: "Movement, Staging & Choreography",
    email: "ryyana@novapa.org",
    forWhat:
      "Choreography, staging and the Saturday leads calls.",
  },
  {
    name: "Katie Rivers",
    title: "Director of Health & Safety",
    email: "katie@novapa.org",
    forWhat:
      "Allergies, medications, injuries, and anything about your child's wellbeing in the building.",
  },
  {
    name: "Zoe Schauder",
    title: "Executive Assistant",
    email: "zoe@novapa.org",
    forWhat:
      "Absences, conflicts, schedule questions, and anything you're not sure who to ask.",
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
    name: "Tony Cimino-Johnson",
    title: "Chief Executive Officer",
    email: "cj@novapa.org",
    forWhat:
      "Anything unresolved, or a concern you would like taken further.",
  },
];

/** The domain every family-facing contact must be on. */
export const STAFF_EMAIL_DOMAIN = "@novapa.org";
