import type { MessageTopic } from "./types";
import { coverageRoleFor } from "./topics";

/**
 * A family's own shows and classes, as things they can write to.
 *
 * Tony, 17 Aug 2026: "if I click my class title, it goes to the teacher of my
 * class, or my show title goes to the teacher of my show."
 *
 * The contact tree answers questions about the ORGANIZATION — refunds,
 * allergies, tickets — and it answers them the same way for everybody. It has
 * nothing to say about the question a parent asks most: something about the
 * specific room their child is in. "Is Ava's costume meant to come home this
 * weekend" is not a health question or a billing question; it is a Sweeney
 * question, and it belongs to whoever runs Sweeney.
 *
 * These topics are therefore per family and computed per request. There is no
 * table of them and there must not be: the moment one exists it disagrees with
 * who is actually assigned to the show.
 */

export interface OfferingContact {
  /** The show or class, titled as the family knows it. */
  offering: string;
  /** "Your shows" / "Your classes" — the heading it groups under. */
  category: string;
  /** Stable id for the topic, so a thread can record which one was picked. */
  routeId: string;
  staffId: string;
  recipientName: string;
  recipientTitle?: string;
  recipientEmail?: string;
  /** Which of the family's children is in it, for the blurb. */
  studentNames: string[];
  /** Sorts within the group — soonest, or alphabetical. */
  sortOrder: number;
}

/**
 * Who a message about one offering should go to.
 *
 * A show has a creative team of up to five and a class usually has one
 * teacher. Preference order, and the reasoning:
 *
 *   1. The director. They run the room and they are who a parent means by
 *      "the person in charge of the show".
 *   2. Anyone else on it with an org address, most-involved first — a
 *      colleague holding three jobs on this show is more likely to know the
 *      answer than one holding one.
 *
 * Somebody with no org address is skipped rather than used, matching the rule
 * on every other family-facing route: five of fifteen staff records carry a
 * personal address and none of them belongs in a parent's To: field.
 */
const DIRECTOR = /\bdirector\b/i;

export function pickRecipient<
  T extends { role?: string; recipientEmail?: string; roleCount: number },
>(candidates: T[]): T | undefined {
  const reachable = candidates.filter((candidate) =>
    candidate.recipientEmail?.toLowerCase().endsWith("@novapa.org")
  );
  if (reachable.length === 0) return undefined;

  const directors = reachable.filter((candidate) => DIRECTOR.test(candidate.role ?? ""));
  const pool = directors.length > 0 ? directors : reachable;
  return [...pool].sort((a, b) => b.roleCount - a.roleCount)[0];
}

/** Turn resolved offering contacts into topics the message form can render. */
export function offeringTopics(contacts: OfferingContact[]): MessageTopic[] {
  return contacts
    .filter((contact) => Boolean(contact.recipientEmail))
    .map((contact) => ({
      routeId: contact.routeId,
      category: contact.category,
      topic: contact.offering,
      blurb: blurbFor(contact),
      // Never Immediate: a question about a class is not an emergency, and
      // dressing it as one would train families past the warning that matters.
      priority: "Standard" as const,
      sortOrder: contact.sortOrder,
      staffId: contact.staffId,
      recipientName: contact.recipientName,
      recipientTitle: contact.recipientTitle,
      recipientEmail: contact.recipientEmail!,
      recipientRole: coverageRoleFor({
        category: contact.category,
        recipientTitle: contact.recipientTitle,
      }),
    }));
}

/** "Anything about Ava's rehearsals, costumes or scenes." */
function blurbFor(contact: OfferingContact): string {
  const who =
    contact.studentNames.length === 0
      ? "your child's"
      : contact.studentNames.length === 1
        ? `${contact.studentNames[0]}'s`
        : `${contact.studentNames.slice(0, -1).join(", ")} and ${contact.studentNames.at(-1)}'s`;
  return contact.category === "Your classes"
    ? `Anything about ${who} class — what to wear, what they're working on, a week they'll miss.`
    : `Anything about ${who} rehearsals, costumes, scenes or the run.`;
}
