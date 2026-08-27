/**
 * Types describing data as it arrives FROM the registration system.
 * Deliberately loose — external systems are messy and we normalize on import.
 */

export type RegistrationSource = "sawyer" | "regpack" | "manual" | "mock" | "website";

/** A registration-system account, which maps to one app family. */
export interface ExternalAccount {
  /** Stable id in the external system (Sawyer client id, RegPack user id). */
  externalId: string;
  source: RegistrationSource;
  guardianName: string;
  email: string;
  phone?: string;
}

/** A child/participant record in the external system. */
export interface ExternalParticipant {
  externalId: string;
  accountExternalId: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
}

/** One purchased enrollment (Sawyer "order"). */
export interface ExternalEnrollment {
  externalId: string;
  source: RegistrationSource;
  participantExternalId: string;
  accountExternalId: string;
  /** Offering name exactly as it appears in the external system. */
  offeringName: string;
  /** Sawyer activity-set id, when known — enables deep linking. */
  activitySetId?: string;
  /**
   * The website's `activities.category` for this purchase — "class", "camp",
   * "performance" or "coaching". Coaching is neither a production nor a class
   * and resolves against the staff portal's catalog instead; see reconcile.
   */
  offeringCategory?: string;
  /** The website's `activities.id`, the key both systems agree on. */
  offeringActivityId?: number;
  /**
   * When the session runs, from the catalog. Captured because activities is
   * a live listing: once a season ends it rolls over to next year and the dates
   * that were true for fees already paid are gone.
   */
  sessionStartsOn?: string;
  sessionEndsOn?: string;
  status: "enrolled" | "waitlisted" | "cancelled";
  /** Outstanding balance in cents (0 when paid in full). */
  balanceCents: number;
  amountPaidCents: number;
  enrolledAt: string;
}

/** A single pull from the external system. */
export interface RegistrationSnapshot {
  accounts: ExternalAccount[];
  participants: ExternalParticipant[];
  enrollments: ExternalEnrollment[];
  /** When this snapshot was produced. */
  fetchedAt: string;
  source: RegistrationSource;
}

/* ── sync bookkeeping ───────────────────────────────────────────────────── */

export type SyncStatus = "success" | "partial" | "failed";

export interface SyncIssue {
  kind:
    | "unmatched_account"
    | "unmatched_participant"
    | "unknown_offering"
    | "conflict"
    | "parse_error";
  message: string;
  externalId?: string;
}

export interface SyncRun {
  id: string;
  source: RegistrationSource;
  startedAt: string;
  finishedAt?: string;
  status: SyncStatus;
  trigger: "manual" | "webhook" | "scheduled";
  counts: {
    accountsSeen: number;
    enrollmentsSeen: number;
    enrollmentsCreated: number;
    enrollmentsUpdated: number;
    balancesUpdated: number;
  };
  issues: SyncIssue[];
  /** Present when status is "failed". */
  error?: string;
}

/** Links an app family to its account in an external system. */
export interface AccountLink {
  familyId: string;
  source: RegistrationSource;
  externalId: string;
  externalEmail: string;
  linkedAt: string;
  /** Set when a link was auto-matched by email rather than confirmed. */
  autoMatched: boolean;
}
