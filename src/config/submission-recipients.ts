/**
 * Who gets told when a family submits a spirit button or a star page.
 *
 * Tony, 17 Aug 2026: "make sure this is submitted to Jen, Tony, CJ, Todd,
 * Katie r, and Katie h", with the three new addresses given as jen@,
 * cj@ and katieh@.
 *
 * Six names, five addresses: src/config/contacts.ts records Tony
 * Cimino-Johnson AS cj@novapa.org, so "Tony" and "CJ" resolve to one mailbox.
 * If there is a separate tony@novapa.org, add it here — a missing recipient
 * on a keepsake order is a parent whose button never gets pressed.
 *
 * Org addresses only, same rule as the family-facing contact list: never a
 * personal mailbox.
 */
export interface SubmissionRecipient {
  name: string;
  email: string;
}

export const SUBMISSION_RECIPIENTS: SubmissionRecipient[] = [
  { name: "Jen", email: "jen@novapa.org" },
  { name: "Tony Cimino-Johnson", email: "cj@novapa.org" },
  { name: "Todd Cimino-Johnson", email: "todd@novapa.org" },
  { name: "Katie Rivers", email: "katie@novapa.org" },
  { name: "Katie H", email: "katieh@novapa.org" },
];

export const SUBMISSION_RECIPIENT_EMAILS = SUBMISSION_RECIPIENTS.map((r) => r.email);
