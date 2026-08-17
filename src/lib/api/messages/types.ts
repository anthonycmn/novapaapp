/**
 * Direct messages from families to the office.
 *
 * A family picks the CONCERN — "Refund request", "Allergies or dietary needs" —
 * and the staff portal's contact tree says whose concern that is. The parent
 * never has to know that refunds are the CFO's and allergies are the Director
 * of Health & Safety's; that mapping is CJ's to maintain, on a page he already
 * maintains it on, and it updates here the moment he changes it.
 *
 * Every thread is ALSO addressed to a role, and that has not changed. The role
 * decides who can see the thread, which is what stops a message about a child's
 * medication sitting unread in one person's inbox while they are on holiday.
 * Naming Katie tells the family who is answering; it does not hide the thread
 * from the administrators who cover for her.
 */

export type MessageRecipientRole = "admin" | "health_safety";

/**
 * The fallback list, used only when the bridge to the staff portal is
 * unreachable. A parent who cannot see the real topics can still get a message
 * to somebody rather than being told to come back later.
 */
export const RECIPIENT_ROLES: Array<{
  value: MessageRecipientRole;
  label: string;
  description: string;
}> = [
  {
    value: "admin",
    label: "The office / administrator",
    description: "Scheduling, billing, general questions",
  },
  {
    value: "health_safety",
    label: "Director of Health & Safety",
    description: "Allergies, medication, injuries, accessibility, safeguarding",
  },
];

/**
 * One concern a family can pick, and who it reaches.
 *
 * Read live from `staff_portal.v_family_contact_routes`. Nothing about this
 * list is configured in this app: onboard a colleague, give them a route, and
 * they appear here on the next page load with no deploy.
 */
export interface MessageTopic {
  /** staff_portal.contact_routes.id */
  routeId: string;
  /** The heading it groups under — "Health & safety", "Families". */
  category: string;
  /** The concern, in a parent's words. */
  topic: string;
  /** One line on when to pick it. */
  blurb?: string;
  /**
   * The contact tree's own urgency. Carried through so the form can say that a
   * message is the wrong tool for something happening right now.
   */
  priority: "Immediate" | "Urgent" | "Standard";
  /** The contact tree's own ordering within a category. */
  sortOrder: number;
  staffId: string;
  recipientName: string;
  recipientTitle?: string;
  recipientEmail: string;
  /** Which role covers this topic, so the thread stays visible to cover. */
  recipientRole: MessageRecipientRole;
}

export interface StartThreadInput {
  /**
   * The concern the family picked, from listMessageTopics(). The provider
   * resolves it to a person, so a caller cannot address a thread to somebody
   * who is not actually on a family-facing route.
   */
  topicId?: string;
  /**
   * Only used when the bridge to the staff portal is down and the family was
   * shown the two fallback roles instead of the real topics.
   */
  recipientRole?: MessageRecipientRole;
  subject: string;
  body: string;
  studentId?: string;
}

export type ThreadStatus = "open" | "closed";

export interface MessageThread {
  id: string;
  familyId: string;
  /** Who can SEE this. Unchanged, and still the cover guarantee. */
  recipientRole: MessageRecipientRole;
  /**
   * Who it was ADDRESSED to, as at the moment the family sent it.
   *
   * Copied onto the thread rather than looked up on read: this is a record of
   * what we told a family, and re-pointing the route next season must not
   * rewrite that sentence in a conversation that already happened.
   */
  routeId?: string;
  routeTopic?: string;
  recipientStaffId?: string;
  recipientName?: string;
  recipientTitle?: string;
  recipientEmail?: string;
  subject: string;
  /** Optional: which child this is about. */
  studentId?: string;
  status: ThreadStatus;
  createdAt: string;
  lastMessageAt: string;
  /** Set when staff mark it as needing urgent attention. */
  urgent: boolean;
}

export interface Message {
  id: string;
  threadId: string;
  authorUserId: string;
  authorName: string;
  /** "family" or "staff" — drives which side of the conversation it sits on. */
  authorSide: "family" | "staff";
  body: string;
  createdAt: string;
  /** When the other side first read it. */
  readAt?: string;
}

export interface ThreadWithMessages {
  thread: MessageThread;
  messages: Message[];
  /** Resolved for display. */
  familyName: string;
  studentName?: string;
}
