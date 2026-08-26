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
  /** Optional photo the parent uploaded of themselves. Never required. */
  photoUrl?: string;
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
  /**
   * The registration listing this class is sold as (`public.activities.id`).
   *
   * Set when the offering was written in the staff portal, which knows both
   * ids at the moment it creates them. It is the only match between the two
   * systems that cannot quietly go wrong — see the note in reconcile.ts.
   */
  registrationActivityId?: number;
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
  /** Curriculum & materials link, synced from the staff portal's plan. */
  curriculumUrl?: string;
  /**
   * The registration listing this production is sold as
   * (`public.activities.id`). See ClassOffering.registrationActivityId.
   */
  registrationActivityId?: number;
}

export interface Enrollment {
  id: string;
  studentId: string;
  /** Enrolled in a class, a production, or coaching (exactly one set). */
  classId?: string;
  productionId?: string;
  /**
   * A coaching package, keyed by the website activity id. Coaching lives in
   * the staff portal; the hub only records that this family bought it, and
   * resolves the name and price through `staff_portal.v_coaching_catalog`.
   */
  coachingActivityId?: number;
  status: "enrolled" | "waitlisted" | "withdrawn";
  balanceCents: number;
  source: "registration_portal" | "manual";
  /**
   * What kind of thing this is, from the registration system: camp, class,
   * coaching or performance. Undefined means unclassified — and an
   * unclassified fee is left OFF an FSA statement rather than guessed at.
   */
  offeringCategory?: string;
  /**
   * Paid to date for this enrollment, from the registration system.
   *
   * Undefined means we have NO payment record, which is not the same as zero:
   * an FSA statement reports the first as unknown and would report the second
   * as nothing paid.
   */
  amountPaidCents?: number;
  /**
   * When the care actually happened, captured from the catalogue the first
   * time the sync saw this enrollment and never rewritten afterwards.
   *
   * The catalogue rolls over each season — summer 2026's camps already list
   * July 2027 dates — so this is the only record of the dates that were true
   * for the fees a family paid.
   */
  sessionStartsOn?: string;
  sessionEndsOn?: string;
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
  /**
   * `staff_portal.staff.id` for the same person, where the bridge has been
   * matched up. This is the join the coaching pages use to put a portal coach
   * next to the bio a family already reads here, instead of the portal
   * keeping a second copy of it (portal migration 0151).
   */
  portalStaffId?: string;
  fullName: string;
  title: string; // "Teaching Artist", "Artistic Director"
  bio: string;
  photoUrl?: string;
  specialties: string[];
  credits?: string;
  /**
   * A short note addressed to the families of the children this person
   * teaches. Not a bio — a bio is a CV, and a CV is not what a parent wants
   * when the question is "who is spending four hours a week with my child".
   */
  familyMessage?: string;
  /** Receives messages addressed to the Director of Health & Safety. */
  isHealthSafetyDirector?: boolean;
  /** Draft edits awaiting admin approval (Phase 1 #14). */
  pendingChanges?: Partial<
    Pick<
      StaffProfile,
      "bio" | "title" | "photoUrl" | "specialties" | "credits" | "familyMessage"
    >
  >;
  isPublished: boolean;
}

/**
 * One colleague, and where a family meets them.
 *
 * A person can hold several roles across a family's offerings — Ryyana is
 * Vocal Director, Costume Designer and Hair/Make-Up on the same show — so the
 * roles are a list against one profile rather than one row per assignment. A
 * card per role would show a parent the same face four times.
 */
export interface StaffAssignment {
  profile: StaffProfile;
  /** "Vocal Director on Frozen, Kids", "Teaches Acting (9 – 12 yrs)". */
  roles: Array<{
    /** The show or class title, as the family knows it. */
    offering: string;
    /** Where to read more about it. */
    href: string;
    /** Their job on this one. Absent for a class, where teaching is the job. */
    role?: string;
    /** Which of the family's children meets them here. */
    studentNames: string[];
  }>;
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
  /**
   * Roles called to this rehearsal, straight off the call sheet. When set,
   * the event appears ONLY on the calendars of students holding one of them.
   *
   * This wins over sceneIds, because the two answer different questions. A
   * character-block call works Act I Sc. 8 and 9 with three people in the
   * room; those scenes belong to most of the company, so filtering by scene
   * would invite everyone. The call sheet says who is actually in the room.
   *
   * Unset = the whole production is called.
   */
  roleIds?: string[];
  /**
   * Scenes/numbers this rehearsal covers. Used to filter only when roleIds
   * is unset, and to answer "what is my child in" on the show page.
   * Unset = whole production called.
   */
  sceneIds?: string[];
  /**
   * Who is called, as the show calendar words it: "Sweeney Todd · Mrs. Lovett
   * · Ensemble". Free text from a director, not a join — a parent reads it.
   */
  calledNote?: string;
  /** What this call works: its scene and music lines. */
  worksNote?: string;
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

/* ── Early pickup / late drop-off (Phase 3, #10) ────────────────────────── */

export type PickupRequestStatus = "pending" | "approved" | "denied";

export interface PickupRequest {
  id: string;
  studentId: string;
  familyId: string;
  kind: "late_dropoff" | "early_pickup" | "both";
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
  /**
   * When a parent pressed "I'm here" at the kerb. Null until they do.
   *
   * Tony, 17 Aug 2026: "the ability for the parent to track that and for it to
   * say I'm here." One arrival per request, so it lives on the request rather
   * than in an event log nobody would read.
   */
  arrivedAt?: string;
  /** Who pressed it, so the door knows which grown-up is outside. */
  arrivedByName?: string;
  createdAt: string;
}

/**
 * A family telling us a child will miss part of a show.
 *
 * Tony, 18 Aug 2026: "Allow for parents to submit absences in their dashboard
 * for their shows, and then the director and the show director each receive
 * that information."
 *
 * Deliberately not a request: there is no status, because an absence is
 * reported rather than granted. Attendance stays the register's job in the
 * staff portal; this is what the household said, and when they said it.
 */
export interface AbsenceReport {
  id: string;
  familyId: string;
  studentId: string;
  /** The show. Null once a production is retired; the title still reads. */
  productionId?: string;
  offeringTitle: string;
  /** Single date or an inclusive range. */
  startsOn: string;
  endsOn: string;
  /**
   * The part of the call they will miss, "HH:MM" local. Both undefined means
   * the whole call — which is what every report filed before 23 Aug 2026 is.
   */
  startsAtTime?: string;
  endsAtTime?: string;
  reason: string;
  reportedByName?: string;
  /** Mailboxes the notification actually reached, so staff can see the gaps. */
  notified: string[];
  createdAt: string;
}

/* ── Family calendar (Phase 3, #5) ──────────────────────────────────────── */

export interface FamilyCalendarEvent extends CalendarEvent {
  /** Which of the family's students this event applies to. */
  studentIds: string[];
  /** True when this event overlaps another sibling's event. */
  conflictsWith?: string[];
}

/* ── Spirit buttons store (Phase 5, #11) ────────────────────────────────── */

/** Physical button sizes the org sells, in inches. */
export type ButtonSize = "2.25" | "3" | "3.5";

export type ButtonStyle = "classic" | "star" | "ribbon";

/** Per-production frame art so each show can have its own look. */
export interface ButtonTemplate {
  id: string;
  productionId: string;
  name: string;
  /** Frame/overlay art drawn around the photo. */
  frameImageUrl?: string;
  /** Show logo placed on the button. */
  logoUrl?: string;
  /** Hex accent used for the ring and text. */
  accentColor: string;
  seasonName: string;
  isActive: boolean;
}

/**
 * One price, every size. Tony, 17 Aug 2026: "The spirit buttons are twelve
 * dollars." The table is kept keyed by size rather than collapsed to a
 * constant so a future per-size price is a data change, not a refactor of
 * the cart, the order and the print sheet.
 */
export const SPIRIT_BUTTON_PRICE_CENTS = 1200;

export const BUTTON_PRICES_CENTS: Record<ButtonSize, number> = {
  "2.25": SPIRIT_BUTTON_PRICE_CENTS,
  "3": SPIRIT_BUTTON_PRICE_CENTS,
  "3.5": SPIRIT_BUTTON_PRICE_CENTS,
};

/** Minimum pixels needed for a crisp print at each size (300 DPI + bleed). */
export const BUTTON_MIN_PIXELS: Record<ButtonSize, number> = {
  "2.25": 750,
  "3": 975,
  "3.5": 1125,
};

export interface ButtonDesign {
  /** Uploaded photo (data URL in mock mode, storage URL in production). */
  photoUrl: string;
  /** Natural pixel dimensions of the upload, for the low-res guard. */
  photoWidth: number;
  photoHeight: number;
  studentName: string;
  role: string;
  size: ButtonSize;
  style: ButtonStyle;
  templateId: string;
}

/**
 * A cart line. The store began as spirit buttons only, so the button fields
 * sit inline; catalog products (star pages, lessons) carry `productId` plus
 * a typed `customization` instead. `productType` tells them apart — check it
 * before reading the button fields.
 */
export interface CartItem extends Partial<ButtonDesign> {
  id: string;
  quantity: number;
  unitPriceCents: number;
  productType: import("./store/catalog").ProductType;
  /** Set for catalog products; absent for spirit buttons. */
  productId?: string;
  /** Chosen option (page size, lesson package). */
  optionValue?: string;
  /** What to show in the cart. */
  displayName: string;
  customization?: import("./store/catalog").Customization;
}

/**
 * Narrows a cart/order line to a spirit button, so button-specific code
 * (the preview, the print sheet, the press manifest) can rely on the design
 * fields being present rather than guessing.
 */
export function isButtonLine<T extends { productType: string } & Partial<ButtonDesign>>(
  line: T
): line is T & ButtonDesign {
  return (
    line.productType === "spirit_button" &&
    typeof line.photoUrl === "string" &&
    typeof line.size === "string"
  );
}

export type OrderStatus = "new" | "in_production" | "ready" | "delivered";

export interface OrderItem extends Partial<ButtonDesign> {
  id: string;
  quantity: number;
  unitPriceCents: number;
  productType: import("./store/catalog").ProductType;
  productId?: string;
  optionValue?: string;
  displayName: string;
  customization?: import("./store/catalog").Customization;
}

export interface ButtonOrder {
  id: string;
  familyId: string;
  /** Short human-facing code, e.g. "NPA-1042". */
  reference: string;
  items: OrderItem[];
  subtotalCents: number;
  status: OrderStatus;
  /** Stripe PaymentIntent / Checkout Session id, or a mock id. */
  paymentRef: string;
  paidAt?: string;
  placedByName: string;
  productionId: string;
  createdAt: string;
  statusUpdatedAt: string;
  adminNote?: string;
}

/* ── Session/auth ───────────────────────────────────────────────────────── */

export interface SessionUser extends User {
  /** Convenience: resolved family for parent users. */
  family?: Family;
}


/* ---- volunteer sign-ups (hub 0048) --------------------------------------
 * A sheet is an event on a show — strike night, load-in, a concessions shift
 * — with slots under it. A slot is a time, a job, and how many people are
 * wanted. Built in the staff portal; taken here.
 */
export interface VolunteerSlot {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  notes: string | null;
  capacity: number;
  taken: number;
  placesLeft: number;
  /** First names on the sheet, so a parent can see whether it is covered. */
  volunteers: string[];
  /** Set when this family already has this slot — the id to give it back by. */
  mySignupId: string | null;
}

export interface VolunteerSheet {
  id: string;
  title: string;
  onDate: string | null;
  location: string | null;
  slots: VolunteerSlot[];
}


/* ---- answering a call (hub 0049) ----------------------------------------
 * A family's answer to one call for one child. A conflict also files an
 * absence report, so the answer reaches the morning digest and the staff
 * Conflicts page rather than sitting in a second inbox nobody watches.
 */
export interface CallResponseRecord {
  eventId: string;
  studentId: string;
  status: "attending" | "not_attending" | "injury" | "partial";
  reason: string | null;
  respondedAt: string;
}


/* ---- loaned scripts (staff portal 0159) ---------------------------------
 * A numbered rehearsal script signed out to a student. Staff record the
 * number on the show page; this is the family's half — bug #9 in the 25 Aug
 * feedback, "there does not appear to be any information on the portal
 * regarding loaned manuscripts".
 */
export interface LoanedScript {
  productionId: string;
  productionTitle: string;
  studentId: string;
  studentName: string;
  scriptNumber: string;
  status: "on_loan" | "returned";
  updatedAt: string;
}
