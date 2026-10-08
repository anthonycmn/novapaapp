import type {
  ActPerformer,
  PerformanceAct,
  PerformanceEvent,
  RehearsalAnswer,
  SubmitResult,
} from "./types";

/**
 * The storage half of Performance Events: rows in, rows out, nothing decided.
 *
 * Every rule about WHO may do WHAT lives in service.ts, once, over this
 * interface. The live repository talks to family_hub with the service role;
 * the mock one keeps arrays in memory so the whole sign-up can be walked in
 * the mock-mode preview. The two places a decision is the database's to make
 * (submit, answer an invitation) are methods here, because in live mode they
 * are row-locked RPCs and the mock has to imitate them.
 */

export interface StudentRecord {
  id: string;
  familyId: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  dateOfBirth?: string;
  grade?: string;
  headshotUrl?: string;
  productionIds: string[];
  classIds: string[];
  /** "Frozen JR. Kids", "Musical Theatre Dance II" */
  enrolledIn: string[];
}

export interface GuardianRecord {
  fullName: string;
  email?: string;
  phone?: string;
  isPrimary: boolean;
}

export type NewPerformer = Omit<ActPerformer, "id" | "headshotUrl"> & { actId: string };

export interface PerformanceRepo {
  readonly mode: "mock" | "live";

  /** Every event families may see (not draft, not archived). */
  listVisibleEvents(): Promise<PerformanceEvent[]>;
  getEvent(eventId: string): Promise<PerformanceEvent | null>;

  getAct(actId: string): Promise<PerformanceAct | null>;
  listActsForEvent(eventId: string): Promise<PerformanceAct[]>;
  /** Acts a family submitted, or a student of theirs is on, or an address of theirs was invited to. */
  listActIdsForFamily(familyId: string, emails: string[]): Promise<string[]>;

  insertAct(row: { eventId: string; familyId: string; submittedBy: string }): Promise<string>;
  updateAct(actId: string, patch: Record<string, unknown>): Promise<void>;
  insertPerformer(row: NewPerformer): Promise<string>;
  updatePerformer(performerId: string, patch: Record<string, unknown>): Promise<void>;
  deletePerformer(performerId: string): Promise<void>;
  setAvailability(actId: string, answers: RehearsalAnswer[]): Promise<void>;

  /** Running-order position of each act, once the lineup is published. */
  lineupSlots(eventId: string): Promise<Record<string, number>>;

  familyStudents(actorId: string, familyId: string): Promise<StudentRecord[]>;
  familyGuardians(actorId: string, familyId: string): Promise<GuardianRecord[]>;
  familyName(familyId: string): Promise<string>;

  submit(actId: string, familyId: string, actorId: string, termsMd5: string | undefined): Promise<SubmitResult>;
  withdraw(actId: string, familyId: string): Promise<SubmitResult>;
  answerInvite(performerId: string, accept: boolean, studentId: string | undefined, familyId: string): Promise<SubmitResult>;

  /** Bell notice to whichever family holds this address. Silent when none does. */
  notifyInvitedAddress(email: string, title: string, body: string, url: string): Promise<void>;

  /** Store a small file (a resized headshot) and return its storage path. */
  storeDataUrl(path: string, dataUrl: string): Promise<string>;
  /** Copy a student's existing headshot into the event folder. */
  copyStudentHeadshot(headshotUrl: string, path: string): Promise<string | null>;
  /** One-shot browser upload for big files. Null when storage is not configured. */
  signUpload(path: string): Promise<{ uploadUrl: string; path: string } | null>;
  /** Readable URLs for storage paths, an hour long. */
  signedUrls(paths: string[]): Promise<Record<string, string>>;

  /** The store product a fee is paid through, kept in step by pe_staff_save_event. */
  feeProductId(eventId: string): Promise<string | undefined>;
  /** Which of these acts have a paid order line naming them. */
  paidActIds(actIds: string[]): Promise<Set<string>>;
}

