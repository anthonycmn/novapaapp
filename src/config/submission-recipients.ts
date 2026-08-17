/**
 * Who gets told when a family submits a spirit button or a star page.
 *
 * Tony, 17 Aug 2026: "make sure this is submitted to Jen, Tony, CJ, Todd,
 * Katie r, and Katie h" — then "The six names and addresses can be pulled
 * from the bridge to the staff portal."
 *
 * So the names and job titles come from staff_portal.staff at send time (see
 * resolveSubmissionRecipients), and this file holds only the two things the
 * bridge cannot decide:
 *
 *   1. WHICH staff are on the list — a query cannot infer that.
 *   2. WHERE mail may be sent. The portal is an HR record and holds personal
 *      addresses: Katie Hamburger's row carries a gmail. Families' keepsake
 *      submissions go to org mailboxes only, same rule as the family-facing
 *      contact list, so the org address here always wins.
 *
 * Six names, five mailboxes: the bridge confirms Tony Cimino-Johnson's
 * preferred name IS "CJ" (cj@novapa.org), so Tony and CJ are one person.
 */
export interface SubmissionRecipient {
  /** Matched against staff_portal.staff full_name to pull their real title. */
  portalName: string;
  /** Fallback label if the bridge is unreachable. */
  name: string;
  /** Org mailbox. Never a personal address, whatever the HR record says. */
  email: string;
}

export const SUBMISSION_RECIPIENTS: SubmissionRecipient[] = [
  { portalName: "Jennifer Travis", name: "Jen", email: "jen@novapa.org" },
  { portalName: "Tony Cimino-Johnson", name: "CJ", email: "cj@novapa.org" },
  { portalName: "Todd Cimino-Johnson", name: "Todd", email: "todd@novapa.org" },
  { portalName: "Katie Rivers", name: "Katie Rivers", email: "katie@novapa.org" },
  { portalName: "Katie Hamburger", name: "Katie Hamburger", email: "katieh@novapa.org" },
];

/** Guard: an org address is the only thing we will ever send a family's photo to. */
export function isOrgAddress(email: string): boolean {
  return email.toLowerCase().endsWith("@novapa.org");
}
