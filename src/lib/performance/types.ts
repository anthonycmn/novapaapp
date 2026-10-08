/**
 * Performance Events (hub 0097): CJ creates an event in the staff portal,
 * families sign their students up to perform from the Parent Portal.
 *
 * These are the shapes the Parent Portal works with. The staff portal reads
 * the same rows with its own types.
 */

export const ACT_TYPES = ["song", "dance", "acting", "instrumental", "variety", "other"] as const;
export type ActType = (typeof ACT_TYPES)[number];

export const ACT_FORMATS = ["solo", "duet", "trio", "small_group", "large_group"] as const;
export type ActFormat = (typeof ACT_FORMATS)[number];

export type Requirement = "off" | "optional" | "required";

export type EventStatus = "draft" | "published" | "closed" | "lineup_set" | "done" | "archived";

export type ActStatus =
  | "draft"
  | "submitted"
  | "needs_changes"
  | "accepted"
  | "waitlisted"
  | "declined"
  | "withdrawn";

export type TrackMode = "upload" | "accompanist" | "a_cappella" | "own";

export const ACT_TYPE_LABELS: Record<ActType, string> = {
  song: "Song",
  dance: "Dance",
  acting: "Acting (monologue or scene)",
  instrumental: "Instrumental",
  variety: "Comedy or variety",
  other: "Other",
};

export const ACT_FORMAT_LABELS: Record<ActFormat, string> = {
  solo: "Solo",
  duet: "Duet",
  trio: "Trio",
  small_group: "Small group (4-8)",
  large_group: "Large group (9+)",
};

/** What a family sees on the status chip. "declined" reads gently. */
export const ACT_STATUS_LABELS: Record<ActStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  needs_changes: "Needs changes",
  accepted: "Accepted",
  waitlisted: "Waitlisted",
  declined: "Not this time",
  withdrawn: "Withdrawn",
};

export interface EventRehearsal {
  id: string;
  onDate: string; // YYYY-MM-DD, Eastern
  startsAt?: string; // HH:MM
  endsAt?: string;
  place?: string;
  required: boolean;
  notes?: string;
}

export interface PerformanceEvent {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  posterUrl?: string;
  startsAt?: string; // ISO UTC
  callAt?: string;
  endsAt?: string;
  venueName?: string;
  venueAddress?: string;
  signupOpensAt?: string;
  signupClosesAt?: string;
  audience: "all" | "chosen";
  /** Production / class ids from the eligibility list. */
  eligibleProductionIds: string[];
  eligibleClassIds: string[];
  minAge?: number;
  maxAge?: number;
  minGrade?: number;
  maxGrade?: number;
  actTypes: ActType[];
  actFormats: ActFormat[];
  maxActs?: number;
  maxActsPerStudent?: number;
  maxMinutesPerAct?: number;
  maxPerformersPerAct?: number;
  reqVideo: Requirement;
  reqHeadshot: Requirement;
  reqTrack: Requirement;
  reqSheetMusic: Requirement;
  reqBio: Requirement;
  bioMaxChars: number;
  selectionMode: "everyone" | "review";
  allowGuests: boolean;
  feeCents: number;
  /** The product a fee is paid through (the store checkout), when there is a fee. */
  feeProductId?: string;
  termsBody?: string;
  /** Who hears about a new submission. Server-side only; never rendered for a family. */
  alertRecipients: string[];
  status: EventStatus;
  publishedAt?: string;
  lineupPublishedAt?: string;
  rehearsals: EventRehearsal[];
}

export interface ActPerformer {
  id: string;
  kind: "own" | "invited" | "guest";
  studentId?: string;
  /** The performer's family, once known. Never sent for a pending invite. */
  familyId?: string;
  /** Shown only to the family that typed it. */
  inviteEmail?: string;
  inviteStatus: "confirmed" | "pending" | "declined";
  guestName?: string;
  guestAge?: number;
  guestGuardianName?: string;
  guestGuardianContact?: string;
  legalName?: string;
  preferredName?: string;
  ageText?: string;
  gradeText?: string;
  guardianName?: string;
  guardianEmail?: string;
  guardianPhone?: string;
  headshotPath?: string;
  headshotUrl?: string;
  bio?: string;
  pronunciation?: string;
  programName?: string;
  sort: number;
}

export interface ActTech {
  micType?: "handheld" | "headset" | "stand" | "none";
  micCount?: number;
  props?: string;
  setPieces?: string;
  chairs?: number;
  lighting?: string;
  costumeChanges?: string;
  accessibility?: string;
}

export interface RehearsalAnswer {
  rehearsalId: string;
  available: boolean;
  conflictNote?: string;
}

export interface PerformanceAct {
  id: string;
  eventId: string;
  familyId: string;
  status: ActStatus;
  step: number;
  actType?: ActType;
  actFormat?: ActFormat;
  title?: string;
  source?: string;
  characterName?: string;
  runtimeSeconds?: number;
  description?: string;
  contentOk: boolean;
  videoUrl?: string;
  trackMode?: TrackMode;
  trackPath?: string;
  trackFilename?: string;
  trackUrl?: string;
  sheetMusicPath?: string;
  sheetMusicFilename?: string;
  sheetMusicUrl?: string;
  keyTempoNotes?: string;
  tech: ActTech;
  familyNote?: string;
  termsAcceptedAt?: string;
  termsMd5?: string;
  submittedAt?: string;
  statusChangedAt?: string;
  feeCents: number;
  feePaid: boolean;
  performers: ActPerformer[];
  rehearsals: RehearsalAnswer[];
  /** The running-order slot, once the lineup is published. 1-based, acts only. */
  slot?: number;
  updatedAt: string;
}

/** An invitation waiting on this family. Carries only what they need to answer. */
export interface ActInvite {
  performerId: string;
  actId: string;
  eventId: string;
  eventTitle: string;
  actTitle?: string;
  actType?: ActType;
  actFormat?: ActFormat;
  invitedByFamilyName: string;
}

/** A student as the performer step needs them, autofilled from the record. */
export interface PerformerCandidate {
  studentId: string;
  legalName: string;
  preferredName?: string;
  dateOfBirth?: string;
  ageText?: string;
  gradeText?: string;
  headshotUrl?: string;
  enrolledIn: string[];
  eligible: boolean;
  guardianName?: string;
  guardianEmail?: string;
  guardianPhone?: string;
}

/** A partial update to an act from one wizard step. */
export type ActPatch = Partial<
  Pick<
    PerformanceAct,
    | "actType"
    | "actFormat"
    | "title"
    | "source"
    | "characterName"
    | "runtimeSeconds"
    | "description"
    | "contentOk"
    | "videoUrl"
    | "trackMode"
    | "keyTempoNotes"
    | "tech"
  >
> & { step?: number };

export type PerformerPatch = Partial<
  Pick<
    ActPerformer,
    | "legalName"
    | "preferredName"
    | "ageText"
    | "gradeText"
    | "guardianName"
    | "guardianEmail"
    | "guardianPhone"
    | "bio"
    | "pronunciation"
    | "programName"
  >
>;

export type FileKind = "headshot" | "track" | "sheet_music";

export interface SubmitResult {
  ok: boolean;
  message?: string;
  status?: ActStatus;
  resubmitted?: boolean;
}
