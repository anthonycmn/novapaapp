/**
 * Domain types shared by every data adapter (mock + Supabase).
 * All timestamps are ISO-8601 UTC strings; display converts to
 * America/New_York (see org config).
 */

export type Role = "parent" | "student" | "staff" | "admin" | "super_admin";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  /** Set for parents/students: the household they belong to. */
  familyId?: string;
  /** Set for staff/admin: their staff profile. */
  staffId?: string;
  createdAt: string;
}

/* ── Families ───────────────────────────────────────────────────────────── */

export interface Guardian {
  id: string;
  familyId: string;
  userId?: string; // linked auth account, if invited/accepted
  fullName: string;
  email: string;
  phone: string;
  relationship: string; // "Mother", "Father", "Grandparent", …
  isPrimary: boolean;
}

export interface EmergencyContact {
  id: string;
  fullName: string;
  phone: string;
  relationship: string;
}

export interface AuthorizedPickup {
  id: string;
  fullName: string;
  relationship: string;
  photoUrl?: string;
}

export interface Family {
  id: string;
  name: string; // "The Martinez Family"
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zip: string;
  preferredContactMethod: "email" | "sms" | "phone";
  communicationLanguage: string; // BCP-47, e.g. "en", "es"
  /** Staff-visible only. Never rendered for parents. */
  staffNotes?: string;
  emergencyContacts: EmergencyContact[];
  authorizedPickups: AuthorizedPickup[];
  createdAt: string;
  updatedAt: string;
}

/* ── Students ───────────────────────────────────────────────────────────── */

export type TShirtSize = "YXS" | "YS" | "YM" | "YL" | "AS" | "AM" | "AL" | "AXL";

export interface HopesEntry {
  id: string;
  seasonId: string;
  /** "parent" or "student" — whose hopes these are. */
  author: "parent" | "student";
  text: string;
  /** Parent may allow the student to see the parent-authored entry. */
  visibleToStudent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudentConsents {
  /** May the org use the student's photo in general materials? */
  photoUse: boolean;
  /** Opt-in to AI face matching (Phase 6). Revocable; revocation deletes embeddings. */
  faceMatching: boolean;
  /** Show in the families directory (name + program only, behind auth). */
  directoryVisible: boolean;
}

export interface ResumeCredit {
  id: string;
  category: "role" | "training" | "special_skill";
  title: string; // "Annie — Annie Jr." / "Ballet — 4 years" / "Juggling"
  organization?: string;
  year?: string;
  notes?: string;
}

export interface Student {
  id: string;
  familyId: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  pronouns?: string;
  dateOfBirth: string; // ISO date
  grade: string;
  school?: string;
  tshirtSize?: TShirtSize;
  /** Staff-visible only; never shown to other families. */
  allergies?: string;
  /** Staff-visible only. */
  medicalFlags?: string;
  headshotUrl?: string;
  headshotPrintUrl?: string;
  resumePdfUrl?: string;
  resumeCredits: ResumeCredit[];
  vocalRange?: string;
  danceExperience?: string;
  auditionSongUrl?: string;
  auditionAudioUrl?: string;
  consents: StudentConsents;
  /** Whether the student (13+) has their own login sub-profile. */
  hasLogin: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ── Seasons, programs, productions ─────────────────────────────────────── */

export interface Season {
  id: string;
  name: string; // "2026–2027"
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
}

export interface Program {
  id: string;
  name: string; // "Broadway Bound Fall", "Summer Camp Session 2"
  seasonId: string;
  description?: string;
}

export interface ClassOffering {
  id: string;
  programId: string;
  name: string; // "Musical Theater Dance — Level 2"
  dayOfWeek: number; // 0=Sun
  startTime: string; // "16:30" local
  endTime: string;
  location: string;
  staffIds: string[];
}

export interface Production {
  id: string;
  programId: string;
  title: string; // "Frozen Jr."
  seasonId: string;
  venue: string;
  directorStaffId?: string;
  opensOn?: string;
  closesOn?: string;
  /** Per-production spirit button frame art (Phase 5). */
  buttonTemplateUrl?: string;
  ticketsUrl?: string;
}

export interface Enrollment {
  id: string;
  studentId: string;
  /** Enrolled in a class or a production (exactly one set). */
  classId?: string;
  productionId?: string;
  status: "enrolled" | "waitlisted" | "withdrawn";
  balanceCents: number;
  source: "registration_portal" | "manual";
  createdAt: string;
}

export interface CastingAssignment {
  id: string;
  productionId: string;
  studentId: string;
  characterName: string;
  castGroup?: string; // "Red Cast", "Ensemble A"
  isUnderstudy: boolean;
  rehearsalTrack?: string;
  publishedAt?: string; // null until casting released
}

export interface ShowHistoryEntry {
  id: string;
  studentId: string;
  productionTitle: string;
  role: string;
  seasonName: string;
  director?: string;
  venue?: string;
  organization?: string; // outside credits allowed
  /** True when auto-created from published casting. */
  fromCasting: boolean;
  year: string;
}

/* ── Staff ──────────────────────────────────────────────────────────────── */

export interface StaffProfile {
  id: string;
  userId?: string;
  fullName: string;
  title: string; // "Teaching Artist", "Artistic Director"
  bio: string;
  photoUrl?: string;
  specialties: string[];
  credits?: string;
  /** Draft edits awaiting admin approval (Phase 1 #14). */
  pendingChanges?: Partial<Pick<StaffProfile, "bio" | "title" | "photoUrl" | "specialties" | "credits">>;
  isPublished: boolean;
}

/* ── Calendar (Phase 3, types staked out early) ─────────────────────────── */

export type EventType =
  | "class"
  | "rehearsal"
  | "tech"
  | "performance"
  | "workshop"
  | "fitting"
  | "photo_call"
  | "other";

export interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  startsAt: string; // UTC
  endsAt: string; // UTC
  callTime?: string; // UTC — arrive-by
  location: string;
  mapUrl?: string;
  whatToBring?: string;
  contactName?: string;
  contactEmail?: string;
  classId?: string;
  productionId?: string;
  /** Set when the event time/location changed after creation. */
  changedAt?: string;
  changeNote?: string;
}

/* ── Feed (Phase 2, #7) ─────────────────────────────────────────────────── */

export type FeedCategory =
  | "casting"
  | "rehearsal"
  | "fundraising"
  | "show_week"
  | "celebration"
  | "general";

export type ReactionKind = "heart" | "clap" | "star";

export interface FeedAudience {
  /** Empty object = everyone. */
  productionIds?: string[];
  classIds?: string[];
  programIds?: string[];
}

export interface FeedPost {
  id: string;
  authorStaffId: string;
  authorName: string;
  title?: string;
  body: string; // markdown-lite (paragraphs + links)
  imageUrls: string[];
  videoEmbedUrl?: string;
  linkUrl?: string;
  category: FeedCategory;
  audience: FeedAudience;
  isPinned: boolean;
  publishedAt: string;
  reactionCounts: Record<ReactionKind, number>;
}

export interface PostQuestion {
  id: string;
  postId: string;
  askerUserId: string;
  askerName: string;
  question: string;
  answer?: string;
  answeredByName?: string;
  answeredAt?: string;
  /** Staff can publish a Q&A pair as a public FAQ on the post. */
  isPublicFaq: boolean;
  createdAt: string;
}

/* ── Notifications (Phase 2, #2) ────────────────────────────────────────── */

export type NotificationType =
  | "feed_post"
  | "direct_message"
  | "form_due"
  | "schedule_change"
  | "payment_due"
  | "photos_posted"
  | "casting_released"
  | "broadcast";

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  readAt?: string;
  createdAt: string;
}

export interface NotificationPrefs {
  userId: string;
  /** Per-type toggles; missing key = enabled. */
  enabled: Partial<Record<NotificationType, boolean>>;
  quietHoursStart?: string; // "21:00" local
  quietHoursEnd?: string; // "07:00"
}

/* ── Email (Phase 2, #1) ────────────────────────────────────────────────── */

export type EmailCategory =
  | "critical" // safety/logistics — cannot be opted out of
  | "casting"
  | "payment"
  | "newsletter"
  | "fundraising";

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  /** Body with {{merge_fields}}. */
  body: string;
  category: EmailCategory;
}

export interface EmailSend {
  id: string;
  templateId?: string;
  subject: string;
  body: string;
  category: EmailCategory;
  audience: FeedAudience & { handPickedUserIds?: string[] };
  scheduledFor?: string;
  sentAt?: string;
  stats: { delivered: number; opened: number; total: number };
  createdByName: string;
}

/* ── Health & safety forms (Phase 3, #9) ────────────────────────────────── */

export interface HealthFormAnswers {
  allergies: string;
  medications: string;
  medicationAuthorization: boolean;
  conditions: string;
  physicianName: string;
  physicianPhone: string;
  insuranceCarrier: string;
  insurancePolicyNumber: string;
  emergencyTreatmentConsent: boolean;
  dietaryRestrictions: string;
  accessibilityNeeds: string;
}

export interface HealthForm {
  id: string;
  studentId: string;
  seasonId: string;
  answers: HealthFormAnswers;
  /** E-signature: typed name + timestamp + IP, or null while draft. */
  signedByName?: string;
  signedAt?: string;
  signedFromIp?: string;
  expiresOn: string; // ISO date — end of season validity
  createdAt: string;
  updatedAt: string;
}

/* ── Early drop-off / late pick-up (Phase 3, #10) ───────────────────────── */

export type PickupRequestStatus = "pending" | "approved" | "denied";

export interface PickupRequest {
  id: string;
  studentId: string;
  familyId: string;
  kind: "early_dropoff" | "late_pickup" | "both";
  /** Single date or inclusive range. */
  startDate: string;
  endDate: string;
  /** Recurring weekdays within the range (0=Sun); empty = every day. */
  recurringDays: number[];
  dropOffTime?: string; // "08:15" local
  pickUpTime?: string;
  reason: string;
  supervisingAdult?: string;
  authorizedPickupPerson?: string;
  feeCents: number;
  status: PickupRequestStatus;
  decisionNote?: string;
  decidedByName?: string;
  decidedAt?: string;
  createdAt: string;
}

/* ── Family calendar (Phase 3, #5) ──────────────────────────────────────── */

export interface FamilyCalendarEvent extends CalendarEvent {
  /** Which of the family's students this event applies to. */
  studentIds: string[];
  /** True when this event overlaps another sibling's event. */
  conflictsWith?: string[];
}

/* ── Session/auth ───────────────────────────────────────────────────────── */

export interface SessionUser extends User {
  /** Convenience: resolved family for parent users. */
  family?: Family;
}
