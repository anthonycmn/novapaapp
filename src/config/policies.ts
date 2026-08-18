import { org } from "./org";

/**
 * The policies a family agrees to by registering.
 *
 * Tony, 18 Aug 2026: "Parents should not be able to change their policy
 * preferences. It should just live there as a document regarding all the
 * policies they sign and the photos. They should not be able to opt out of
 * anything."
 *
 * So this is a RECORD, not a settings screen. There is no toggle, no checkbox
 * and nothing to submit — the portal shows a household what it agreed to and
 * where the full text lives.
 *
 * The controlling document is the published policies page on the website
 * ("registration constitutes acceptance of all policies below"). What is held
 * here is its index and a one-line summary of each section, so a parent can see
 * the shape of what they signed without leaving the portal, and follow the link
 * for the wording that actually binds. Deliberately NOT a copy of the text: two
 * copies of a refund policy is one copy plus a liability.
 */

export interface PolicySection {
  /** Matches the anchor on the published page, so the link lands in place. */
  anchor: string;
  title: string;
  /** One line, in the org's own words wherever the page gives one. */
  summary: string;
}

export const POLICIES_URL = `${org.websiteUrl}/policies.html`;

/** Section One of the published page — the terms every registration accepts. */
export const REGISTRATION_TERMS: PolicySection[] = [
  {
    anchor: "registration",
    title: "Registration",
    summary: "Enrollment is a binding commitment once a place is taken.",
  },
  {
    anchor: "balance",
    title: "Balance due date",
    summary:
      "The last day payment may be made. Unpaid balances stop participation until they are settled.",
  },
  {
    anchor: "refunds",
    title: "Refund policy",
    summary:
      "No refunds for missed days or early withdrawal; written withdrawal a month ahead can earn a tuition credit, with a $90 administrative fee.",
  },
  {
    anchor: "tuition-insurance",
    title: "Tuition insurance",
    summary:
      "Optional, bought at checkout at 10% of list price, on a sliding refund scale by how far ahead you withdraw.",
  },
  {
    anchor: "account-balance",
    title: "Account balance",
    summary:
      "A 14-day grace period, then a 3% weekly late fee; declined payments carry a 3% fee.",
  },
  {
    anchor: "pickup",
    title: "Late pick-up and early drop-off",
    summary:
      "$15 for each 15 minutes after the end time, and $1 a minute for a child left before the start time.",
  },
  {
    anchor: "bullying",
    title: "Zero tolerance for bullying",
    summary:
      "Reported, investigated confidentially, and answered with suspension or expulsion without refund.",
  },
  {
    anchor: "communication",
    title: "Communication",
    summary:
      "Email is the official channel and the record. Social media and text are convenience, not notice.",
  },
  {
    anchor: "dress-code",
    title: "Dress code and what to bring",
    summary:
      "Modest movement clothes, closed-toed or dance shoes, hair off the face, everything named.",
  },
  {
    anchor: "casting",
    title: "Placement, casting and tech week",
    summary:
      "Every registered performer is cast, casting is final, and tech week is mandatory.",
  },
  {
    anchor: "attendance",
    title: "Attendance",
    summary:
      "Tell us immediately when a child cannot attend. Missed days are not reimbursed.",
  },
  {
    anchor: "photo",
    title: "Photo and video",
    summary:
      "The Photo and Media Release signed at registration lets us photograph and film participants for our own materials.",
  },
  {
    anchor: "liability",
    title: "Release of liability",
    summary: "Participation releases NOVA PA, its staff and volunteers from liability for injury.",
  },
  {
    anchor: "medical",
    title: "Medical emergencies",
    summary:
      "You authorize us to obtain treatment for your child, and accept responsibility for its cost. We carry no health insurance for participants.",
  },
  {
    anchor: "medication",
    title: "Medication",
    summary:
      "Handed to the Director of Health & Safety, labeled, for programs over four hours. Students 12 and over carry their own.",
  },
  {
    anchor: "microphones",
    title: "Microphones",
    summary:
      "A student issued one of our twelve $900 wireless microphones is responsible for repairing or replacing it if it breaks in their possession.",
  },
  {
    anchor: "performance",
    title: "Performance",
    summary:
      "Performing at the end of a program is mandatory; not performing forfeits tuition and future eligibility.",
  },
  {
    anchor: "independent",
    title: "Independent entity",
    summary:
      "NOVA PA insures its own operations, and under HIPAA and FERPA cannot access a child's IEP or health care plan.",
  },
];

/** Section Two — how the org handles what a family shares. */
export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    anchor: "what-we-collect",
    title: "What we collect",
    summary:
      "Contact details, a participant's date of birth and emergency information, medical and dietary needs, and billing handled by Stripe.",
  },
  {
    anchor: "sharing",
    title: "Sharing and disclosure",
    summary:
      "Never sold. Shared only with service providers, staff who need it, emergency medical personnel, and authorities where the law requires.",
  },
  {
    anchor: "your-rights",
    title: "Your rights",
    summary:
      "You may ask to see, correct or delete your personal information by writing to the office.",
  },
];
