/**
 * Direct messages from families to the office.
 *
 * Deliberately routed to a ROLE, not a person. A parent shouldn't have to
 * know who handles allergies this season, and a message about a child's
 * medical needs must not sit unread in one person's inbox while they're on
 * holiday. Threads are visible to everyone who covers that role.
 */

export type MessageRecipientRole = "admin" | "health_safety";

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

export type ThreadStatus = "open" | "closed";

export interface MessageThread {
  id: string;
  familyId: string;
  /** Who this is addressed to. */
  recipientRole: MessageRecipientRole;
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
