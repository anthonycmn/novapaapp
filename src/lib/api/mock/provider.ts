import { AccessDeniedError, type DataProvider } from "../provider";
import { offeringFromRow, type OpenOffering } from "../catalog/offerings";
import type {
  AppNotification,
  ButtonDesign,
  ButtonOrder,
  ButtonTemplate,
  CalendarEvent,
  CartItem,
  CastingAssignment,
  ClassOffering,
  OrderStatus,
  EmailSend,
  EmailTemplate,
  Enrollment,
  Family,
  FamilyCalendarEvent,
  FeedAudience,
  FeedCategory,
  FeedPost,
  Guardian,
  HealthForm,
  HealthFormAnswers,
  HopesEntry,
  NotificationPrefs,
  NotificationType,
  PickupRequest,
  PostQuestion,
  Production,
  Program,
  ReactionKind,
  ResumeCredit,
  Season,
  ShowHistoryEntry,
  StaffProfile,
  Student,
  User,
} from "../types";
import { BUTTON_PRICES_CENTS } from "../types";
import type {
  AccountLink,
  RegistrationSnapshot,
  RegistrationSource,
  SyncRun,
} from "../registration/types";
import { reconcile } from "../registration/reconcile";
import type {
  ConsentEvent,
  FaceEmbedding,
  Gallery,
  GalleryPhoto,
  PhotoMatch,
  ReferencePhoto,
} from "../photos/types";
import {
  MAX_REFERENCE_PHOTOS,
  MIN_REFERENCE_PHOTOS,
} from "../photos/types";
import { matchFace, type CandidateStudent } from "../photos/matching";
import { getFaceMatchProvider } from "../photos/face-provider";
import type {
  Review,
  ReviewAggregate,
  ReviewScores,
  ReviewSubjectType,
  ReviewWindow,
  StaffReviewView,
  TrendPoint,
} from "../reviews/types";
import { toStaffView } from "../reviews/types";
import { aggregate, trend } from "../reviews/aggregate";
import type {
  DocumentCategory,
  FamilyDocument,
  FsaStatement,
} from "../documents/types";
import { buildFsaStatement } from "../documents/fsa";
import {
  assertUploadAllowed,
  getStorageProvider,
  type StorageBucket,
} from "../storage";
import type {
  Message,
  MessageRecipientRole,
  MessageThread,
  MessageTopic,
  StartThreadInput,
  ThreadStatus,
  ThreadWithMessages,
} from "../messages/types";
import { priceFor, type Customization, type Product } from "../store/catalog";
import {
  CONFIRMATION_REMINDER_MS,
  RECOMMENDATION_THRESHOLD,
  RUBRIC_CRITERIA,
  type AuditionEvaluation,
  type AuditionProfile,
  type CastingBoard,
  type CastingConfirmation,
  type Discipline,
  type GrowthRecommendation,
  type RoleTier,
  type ShowRole,
  type ShowScene,
} from "../auditions/types";
import {
  LESSON_CALENDAR_WEEKS,
  LESSON_DISCIPLINES,
  nextLessonOccurrence,
  upcomingLessonOccurrences,
  type LessonBooking,
  type LessonSlot,
} from "../lessons/types";
import * as seed from "./seed-data";

/**
 * In-memory mock backend. Enforces the same authorization rules the
 * Supabase RLS policies enforce (supabase/migrations/*.sql), so the
 * access-control tests in tests/access-control.test.ts hold for both.
 *
 * Module-level singleton: state survives across requests in one dev
 * server process, resets on restart.
 */

interface Store {
  users: User[];
  families: Family[];
  guardians: Guardian[];
  students: Student[];
  staff: StaffProfile[];
  seasons: Season[];
  programs: Program[];
  classes: ClassOffering[];
  productions: Production[];
  enrollments: Enrollment[];
  casting: CastingAssignment[];
  showHistory: ShowHistoryEntry[];
  /** studentId → hopes entries */
  hopes: Map<string, HopesEntry[]>;
  feedPosts: FeedPost[];
  postQuestions: PostQuestion[];
  notifications: AppNotification[];
  notificationPrefs: Map<string, NotificationPrefs>;
  emailTemplates: EmailTemplate[];
  emailSends: EmailSend[];
  events: CalendarEvent[];
  healthForms: HealthForm[];
  pickupRequests: PickupRequest[];
  /** familyId → iCal token */
  calendarTokens: Map<string, string>;
  accountLinks: AccountLink[];
  syncRuns: SyncRun[];
  /** enrollmentId → external system id, so re-runs don't duplicate. */
  enrollmentExternalIds: Map<string, string>;
  buttonTemplates: ButtonTemplate[];
  /** userId → cart */
  carts: Map<string, CartItem[]>;
  orders: ButtonOrder[];
  orderSequence: number;
  galleries: Gallery[];
  galleryPhotos: GalleryPhoto[];
  referencePhotos: ReferencePhoto[];
  /** The only biometric artifacts we hold. Deleted on revocation. */
  embeddings: FaceEmbedding[];
  matches: PhotoMatch[];
  consentEvents: ConsentEvent[];
  reviewWindows: ReviewWindow[];
  reviews: Review[];
  familyDocuments: FamilyDocument[];
  /** Rejection notes for staff profile edits, keyed by staff id. */
  staffChangeRejections: Map<string, string>;
  emailOpens: Array<{ sendId: string; recipientId: string; at: string }>;
  emailClicks: Array<{ sendId: string; recipientId: string; url: string; at: string }>;
  threads: MessageThread[];
  messages: Message[];
  products: Product[];
  showRoles: ShowRole[];
  auditionProfiles: AuditionProfile[];
  auditionEvaluations: AuditionEvaluation[];
  castingBoards: Map<string, CastingBoard>;
  castingConfirmations: CastingConfirmation[];
  showScenes: ShowScene[];
  /** Rehearsal notifications already sent, so cron re-runs don't duplicate. */
  eventNotices: Array<{ eventId: string; familyId: string; kind: "reminder" | "thanks"; at: string }>;
  lessonSlots: LessonSlot[];
  lessonBookings: LessonBooking[];
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function buildStore(): Store {
  const hopes = new Map<string, HopesEntry[]>();
  for (const [studentId, hopeIds] of Object.entries(seed.hopesByStudent)) {
    hopes.set(
      studentId,
      seed.hopes.filter((h) => hopeIds.includes(h.id)).map(deepClone)
    );
  }
  return {
    users: deepClone(seed.users),
    families: deepClone(seed.families),
    guardians: deepClone(seed.guardians),
    students: deepClone(seed.students),
    staff: deepClone(seed.staffProfiles),
    seasons: deepClone(seed.seasons),
    programs: deepClone(seed.programs),
    classes: deepClone(seed.classes),
    productions: deepClone(seed.productions),
    enrollments: deepClone(seed.enrollments),
    casting: deepClone(seed.casting),
    showHistory: deepClone(seed.showHistory),
    hopes,
    feedPosts: deepClone(seed.feedPosts),
    postQuestions: deepClone(seed.postQuestions),
    notifications: [],
    notificationPrefs: new Map(),
    emailTemplates: deepClone(seed.emailTemplates),
    emailSends: [],
    events: deepClone(seed.events),
    healthForms: deepClone(seed.healthForms),
    pickupRequests: [],
    calendarTokens: new Map([
      ["fam-martinez", "cal-tok-martinez-8f3a"],
      ["fam-okafor", "cal-tok-okafor-2b7c"],
      ["fam-nguyen", "cal-tok-nguyen-5d1e"],
    ]),
    accountLinks: [],
    syncRuns: [],
    enrollmentExternalIds: new Map(),
    buttonTemplates: deepClone(seed.buttonTemplates),
    carts: new Map(),
    orders: [],
    orderSequence: 1042,
    galleries: [],
    galleryPhotos: [],
    referencePhotos: [],
    embeddings: [],
    matches: [],
    consentEvents: [],
    reviewWindows: deepClone(seed.reviewWindows),
    reviews: deepClone(seed.reviews),
    familyDocuments: [],
    staffChangeRejections: new Map(),
    emailOpens: [],
    emailClicks: [],
    threads: [],
    messages: [],
    products: deepClone(seed.products),
    showRoles: deepClone(seed.showRoles),
    auditionProfiles: [],
    auditionEvaluations: [],
    castingBoards: new Map(),
    castingConfirmations: [],
    showScenes: deepClone(seed.showScenes),
    eventNotices: [],
    lessonSlots: deepClone(seed.lessonSlots),
    lessonBookings: [],
  };
}

let store = buildStore();

/** Test helper: restore pristine seed state. */
export function resetMockStore() {
  store = buildStore();
}

/* ── snapshot serialization (for cross-instance persistence) ────────────
 * On serverless hosts every function instance gets its own module memory,
 * so "saving" to this store would silently vanish between requests. The
 * persistence layer (mock/persistence.ts) snapshots the whole store to
 * Netlify Blobs after each write and reloads it before reads.
 *
 * Maps aren't JSON, so they round-trip through a {__map: entries} marker.
 * The id counter and monotonic clock travel with the snapshot — otherwise
 * a fresh instance would mint colliding ids.
 */

export function serializeMockStore(): string {
  return JSON.stringify({ store, idCounter, lastNow }, (_key, value) =>
    value instanceof Map ? { __map: [...(value as Map<unknown, unknown>).entries()] } : value
  );
}

export function restoreMockStore(json: string): void {
  const parsed = JSON.parse(json, (_key, value) =>
    value && typeof value === "object" && "__map" in (value as object)
      ? new Map((value as { __map: [unknown, unknown][] }).__map)
      : value
  ) as { store: Store; idCounter: number; lastNow: number };
  store = parsed.store;
  // Snapshots written before newer features existed lack these fields.
  store.showScenes ??= deepClone(seed.showScenes);
  store.eventNotices ??= [];
  store.lessonSlots ??= deepClone(seed.lessonSlots);
  store.lessonBookings ??= [];
  idCounter = Math.max(idCounter, parsed.idCounter);
  lastNow = Math.max(lastNow, parsed.lastNow);
}

let idCounter = 1000;
const nextId = (prefix: string) => `${prefix}-${idCounter++}`;

/**
 * Monotonic clock for generated timestamps.
 *
 * Several events can be created inside a single millisecond (granting then
 * revoking consent, a batch of notifications). Plain `Date.now()` gives them
 * identical `createdAt` values, which makes any "newest first" sort
 * ambiguous — an audit trail that reorders itself depending on machine load
 * is not an audit trail. Guaranteeing each call is strictly later keeps
 * ordering deterministic. Postgres solves the same problem with a sequence.
 */
let lastNow = 0;
const nowIso = () => {
  const now = Math.max(Date.now(), lastNow + 1);
  lastNow = now;
  return new Date(now).toISOString();
};

/* ── authorization helpers (mirror RLS) ─────────────────────────────────── */

function getActor(actorId: string): User {
  const actor = store.users.find((u) => u.id === actorId);
  if (!actor) throw new AccessDeniedError("Unknown user");
  return actor;
}

function isStaffish(actor: User): boolean {
  return actor.role === "staff" || actor.role === "admin" || actor.role === "super_admin";
}

function isAdmin(actor: User): boolean {
  return actor.role === "admin" || actor.role === "super_admin";
}

function assertFamilyAccess(actor: User, familyId: string) {
  if (isStaffish(actor)) return;
  if (actor.familyId === familyId) return;
  throw new AccessDeniedError("Not your family");
}

/** Writes mirror RLS: own-family parent, or admin. Staff are read-only. */
function assertFamilyWrite(actor: User, familyId: string) {
  if (isAdmin(actor)) return;
  if (actor.role === "parent" && actor.familyId === familyId) return;
  throw new AccessDeniedError("Not allowed to modify this family");
}

function assertStudentAccess(actor: User, student: Student) {
  assertFamilyAccess(actor, student.familyId);
}

/** Strip staff-only fields for non-staff viewers of their own children.
 *  (Parents CAN see their own child's allergies — they entered them.
 *  This strips staff notes-style fields only where policy requires.) */
function studentViewFor(actor: User, student: Student): Student {
  // Parents see everything on their own child. Staff see everything on
  // students in their programs. No other combination reaches this point.
  return deepClone(student);
}

/* ── provider ───────────────────────────────────────────────────────────── */

export class MockDataProvider implements DataProvider {
  async getUserById(userId: string): Promise<User | null> {
    return deepClone(store.users.find((u) => u.id === userId) ?? null);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    return deepClone(
      store.users.find((u) => u.email.toLowerCase() === normalized) ?? null
    );
  }

  async getFamily(actorId: string, familyId: string): Promise<Family | null> {
    const actor = getActor(actorId);
    assertFamilyAccess(actor, familyId);
    const family = store.families.find((f) => f.id === familyId) ?? null;
    if (!family) return null;
    const view = deepClone(family);
    if (!isStaffish(actor)) {
      // staffNotes is staff-visible only.
      delete view.staffNotes;
    }
    return view;
  }

  async updateFamily(actorId: string, familyId: string, patch: Partial<Family>): Promise<Family> {
    const actor = getActor(actorId);
    assertFamilyWrite(actor, familyId);
    const family = store.families.find((f) => f.id === familyId);
    if (!family) throw new Error("Family not found");
    if (!isStaffish(actor)) {
      // Parents cannot write staff notes.
      delete patch.staffNotes;
    }
    Object.assign(family, patch, { id: familyId, updatedAt: nowIso() });
    return deepClone(family);
  }

  async getGuardians(actorId: string, familyId: string): Promise<Guardian[]> {
    const actor = getActor(actorId);
    assertFamilyAccess(actor, familyId);
    return deepClone(store.guardians.filter((g) => g.familyId === familyId));
  }

  async inviteGuardian(
    actorId: string,
    familyId: string,
    invite: { fullName: string; email: string; relationship: string }
  ): Promise<Guardian> {
    const actor = getActor(actorId);
    assertFamilyAccess(actor, familyId);
    const guardian: Guardian = {
      id: nextId("g"),
      familyId,
      fullName: invite.fullName,
      email: invite.email,
      phone: "",
      relationship: invite.relationship,
      isPrimary: false,
    };
    store.guardians.push(guardian);
    return deepClone(guardian);
  }

  async updateGuardian(
    actorId: string,
    guardianId: string,
    patch: Partial<
      Pick<Guardian, "fullName" | "email" | "phone" | "relationship" | "photoUrl">
    >
  ): Promise<Guardian> {
    const actor = getActor(actorId);
    const guardian = store.guardians.find((g) => g.id === guardianId);
    if (!guardian) throw new Error("Guardian not found");
    assertFamilyAccess(actor, guardian.familyId);
    // isPrimary and userId decide who the account belongs to, so they are not
    // in the patch type and cannot be reached from here.
    Object.assign(guardian, patch);
    return deepClone(guardian);
  }

  async addGuardian(
    actorId: string,
    familyId: string,
    guardian: Pick<Guardian, "fullName" | "email" | "phone" | "relationship">
  ): Promise<Guardian> {
    const actor = getActor(actorId);
    assertFamilyAccess(actor, familyId);
    const created: Guardian = {
      id: nextId("g"),
      familyId,
      isPrimary: false,
      ...guardian,
    };
    store.guardians.push(created);
    return deepClone(created);
  }

  async getStudentsForFamily(actorId: string, familyId: string): Promise<Student[]> {
    const actor = getActor(actorId);
    assertFamilyAccess(actor, familyId);
    return store.students
      .filter((s) => s.familyId === familyId)
      .map((s) => studentViewFor(actor, s));
  }

  async getStudent(actorId: string, studentId: string): Promise<Student | null> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) return null;
    assertStudentAccess(actor, student);
    return studentViewFor(actor, student);
  }

  async updateStudent(actorId: string, studentId: string, patch: Partial<Student>): Promise<Student> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) throw new Error("Student not found");
    assertFamilyWrite(actor, student.familyId);
    // familyId is immutable through this path.
    delete patch.familyId;
    Object.assign(student, patch, { id: studentId, updatedAt: nowIso() });
    return deepClone(student);
  }

  async getHopes(actorId: string, studentId: string): Promise<HopesEntry[]> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) return [];
    // Hopes: own family + staff/admin. NEVER other families.
    assertStudentAccess(actor, student);
    const entries = store.hopes.get(studentId) ?? [];
    if (actor.role === "student") {
      // Students see their own entries, and parent entries only when shared.
      return deepClone(entries.filter((e) => e.author === "student" || e.visibleToStudent));
    }
    return deepClone(entries);
  }

  async upsertHopes(
    actorId: string,
    studentId: string,
    entry: { seasonId: string; author: "parent" | "student"; text: string; visibleToStudent?: boolean }
  ): Promise<HopesEntry> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) throw new Error("Student not found");
    assertStudentAccess(actor, student);
    if (isStaffish(actor)) {
      throw new AccessDeniedError("Hopes are written by families, not staff");
    }
    if (entry.author === "parent" && actor.role !== "parent") {
      throw new AccessDeniedError("Only a parent can write parent hopes");
    }
    const entries = store.hopes.get(studentId) ?? [];
    const existing = entries.find(
      (e) => e.seasonId === entry.seasonId && e.author === entry.author
    );
    if (existing) {
      // Versioned: keep the old entry, append a new version.
      const updated: HopesEntry = {
        ...existing,
        id: nextId("hope"),
        text: entry.text,
        visibleToStudent: entry.visibleToStudent ?? existing.visibleToStudent,
        updatedAt: nowIso(),
        createdAt: nowIso(),
      };
      entries.push(updated);
      store.hopes.set(studentId, entries);
      return deepClone(updated);
    }
    const created: HopesEntry = {
      id: nextId("hope"),
      seasonId: entry.seasonId,
      author: entry.author,
      text: entry.text,
      visibleToStudent: entry.visibleToStudent ?? false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    entries.push(created);
    store.hopes.set(studentId, entries);
    return deepClone(created);
  }

  async getShowHistory(actorId: string, studentId: string): Promise<ShowHistoryEntry[]> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) return [];
    assertStudentAccess(actor, student);
    return deepClone(store.showHistory.filter((e) => e.studentId === studentId));
  }

  async addShowHistoryEntry(
    actorId: string,
    studentId: string,
    entry: Omit<ShowHistoryEntry, "id" | "studentId" | "fromCasting">
  ): Promise<ShowHistoryEntry> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) throw new Error("Student not found");
    assertStudentAccess(actor, student);
    const created: ShowHistoryEntry = {
      ...entry,
      id: nextId("sh"),
      studentId,
      fromCasting: false,
    };
    store.showHistory.push(created);
    return deepClone(created);
  }

  async getCurrentSeason(): Promise<Season> {
    const current = store.seasons.find((s) => s.isCurrent);
    if (!current) throw new Error("No current season configured");
    return deepClone(current);
  }

  async getPrograms(seasonId?: string): Promise<Program[]> {
    return deepClone(
      seasonId ? store.programs.filter((p) => p.seasonId === seasonId) : store.programs
    );
  }

  async getClasses(programId?: string): Promise<ClassOffering[]> {
    return deepClone(
      programId ? store.classes.filter((c) => c.programId === programId) : store.classes
    );
  }

  async getProductions(seasonId?: string): Promise<Production[]> {
    return deepClone(
      seasonId ? store.productions.filter((p) => p.seasonId === seasonId) : store.productions
    );
  }

  async getProduction(productionId: string): Promise<Production | null> {
    return deepClone(store.productions.find((p) => p.id === productionId) ?? null);
  }

  async getEnrollmentsForStudent(actorId: string, studentId: string): Promise<Enrollment[]> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) return [];
    assertStudentAccess(actor, student);
    return deepClone(store.enrollments.filter((e) => e.studentId === studentId));
  }

  async getEnrollmentsForFamily(actorId: string, familyId: string): Promise<Enrollment[]> {
    const actor = getActor(actorId);
    assertFamilyAccess(actor, familyId);
    const studentIds = new Set(
      store.students.filter((s) => s.familyId === familyId).map((s) => s.id)
    );
    return deepClone(store.enrollments.filter((e) => studentIds.has(e.studentId)));
  }

  async getCastingForStudent(actorId: string, studentId: string): Promise<CastingAssignment[]> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) return [];
    assertStudentAccess(actor, student);
    // Families only see casting once published.
    const all = store.casting.filter((c) => c.studentId === studentId);
    return deepClone(isStaffish(actor) ? all : all.filter((c) => c.publishedAt));
  }

  async getCastingReview(
    actorId: string,
    productionId: string
  ): Promise<Array<{ student: Student; hopes: HopesEntry[] }>> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) {
      throw new AccessDeniedError("Casting review is staff-only");
    }
    const enrolledIds = new Set(
      store.enrollments
        .filter((e) => e.productionId === productionId && e.status === "enrolled")
        .map((e) => e.studentId)
    );
    return store.students
      .filter((s) => enrolledIds.has(s.id))
      .map((student) => ({
        student: deepClone(student),
        hopes: deepClone(store.hopes.get(student.id) ?? []),
      }));
  }

  async getStaffProfiles(): Promise<StaffProfile[]> {
    return deepClone(store.staff.filter((s) => s.isPublished));
  }

  async getStaffProfile(staffId: string): Promise<StaffProfile | null> {
    return deepClone(store.staff.find((s) => s.id === staffId) ?? null);
  }

  /**
   * A demo catalogue. In production this is the org's own `public.activities`;
   * here it is one of each kind, put through the same mapping so the sold-out
   * and unbookable rules are exercised rather than assumed.
   */
  async listOpenOfferings(): Promise<OpenOffering[]> {
    return [
      { id: 900_001, category: "class", name: "Musical Theatre I · Tuesdays", age_range: "8 – 11 yrs", price_cents: 29500, open_spots: 6 },
      { id: 900_002, category: "class", name: "Acting for the Camera", age_range: "12 – 15 yrs", price_cents: 34500, open_spots: 3 },
      { id: 900_003, category: "camp", name: "Broadway Bound | Frozen, Kids", age_range: "5 – 9 yrs", price_cents: 69500, open_spots: 12 },
      { id: 900_004, category: "coaching", name: "Private voice coaching · 30 min", price_cents: 6500, open_spots: 20 },
      // Full, so it must not appear — the waitlist keeps it active upstream.
      { id: 900_005, category: "camp", name: "Ages 5–9 Day Camp · Oct 12", price_cents: 7900, open_spots: 0 },
    ]
      .map((row) => offeringFromRow({ ...row, active: true, bookable: true, hidden: false }))
      .filter((offering): offering is OpenOffering => offering !== null);
  }

  /* ── feed (#7) ─────────────────────────────────────────────────────── */

  private audienceMatchesUser(audience: FeedAudience, user: User): boolean {
    const isEveryone =
      !audience.productionIds?.length &&
      !audience.classIds?.length &&
      !audience.programIds?.length;
    if (isEveryone) return true;
    if (isStaffish(user)) return true; // staff see everything

    const familyStudentIds = new Set(
      store.students.filter((s) => s.familyId === user.familyId).map((s) => s.id)
    );
    const familyEnrollments = store.enrollments.filter(
      (e) => familyStudentIds.has(e.studentId) && e.status === "enrolled"
    );

    const classPrograms = new Map(store.classes.map((c) => [c.id, c.programId]));
    const productionPrograms = new Map(store.productions.map((p) => [p.id, p.programId]));

    return familyEnrollments.some((enrollment) => {
      if (enrollment.productionId && audience.productionIds?.includes(enrollment.productionId)) {
        return true;
      }
      if (enrollment.classId && audience.classIds?.includes(enrollment.classId)) {
        return true;
      }
      if (audience.programIds?.length) {
        const programId = enrollment.classId
          ? classPrograms.get(enrollment.classId)
          : enrollment.productionId
            ? productionPrograms.get(enrollment.productionId)
            : undefined;
        if (programId && audience.programIds.includes(programId)) return true;
      }
      return false;
    });
  }

  async getFeedForUser(actorId: string): Promise<FeedPost[]> {
    const actor = getActor(actorId);
    return deepClone(
      store.feedPosts
        .filter((post) => this.audienceMatchesUser(post.audience, actor))
        .sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return b.publishedAt.localeCompare(a.publishedAt);
        })
    );
  }

  async createFeedPost(
    actorId: string,
    input: {
      title?: string;
      body: string;
      category: FeedCategory;
      audience: FeedAudience;
      isPinned?: boolean;
      imageUrls?: string[];
      linkUrl?: string;
    }
  ): Promise<FeedPost> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Only staff can post");
    const post: FeedPost = {
      id: nextId("post"),
      authorStaffId: actor.staffId ?? actor.id,
      authorName: actor.displayName,
      title: input.title,
      body: input.body,
      imageUrls: input.imageUrls ?? [],
      linkUrl: input.linkUrl,
      category: input.category,
      audience: input.audience,
      isPinned: input.isPinned ?? false,
      publishedAt: nowIso(),
      reactionCounts: { heart: 0, clap: 0, star: 0 },
    };
    store.feedPosts.push(post);

    // Every push writes a matching in-app record (#2): notify targeted users.
    const recipients = store.users.filter(
      (user) =>
        user.id !== actor.id &&
        !isStaffish(user) &&
        this.audienceMatchesUser(input.audience, user) &&
        this.prefAllows(user.id, "feed_post")
    );
    for (const recipient of recipients) {
      store.notifications.push({
        id: nextId("ntf"),
        userId: recipient.id,
        type: "feed_post",
        title: input.title ?? "New announcement",
        body: input.body.slice(0, 120),
        url: "/feed",
        createdAt: nowIso(),
      });
    }
    return deepClone(post);
  }

  async reactToPost(actorId: string, postId: string, kind: ReactionKind): Promise<FeedPost> {
    getActor(actorId);
    const post = store.feedPosts.find((p) => p.id === postId);
    if (!post) throw new Error("Post not found");
    post.reactionCounts[kind] += 1;
    return deepClone(post);
  }

  async askQuestion(actorId: string, postId: string, question: string): Promise<PostQuestion> {
    const actor = getActor(actorId);
    const post = store.feedPosts.find((p) => p.id === postId);
    if (!post) throw new Error("Post not found");
    const created: PostQuestion = {
      id: nextId("q"),
      postId,
      askerUserId: actor.id,
      askerName: actor.displayName,
      question,
      isPublicFaq: false,
      createdAt: nowIso(),
    };
    store.postQuestions.push(created);
    return deepClone(created);
  }

  async getQuestionsForPost(actorId: string, postId: string): Promise<PostQuestion[]> {
    const actor = getActor(actorId);
    return deepClone(
      store.postQuestions.filter((q) => {
        if (q.postId !== postId) return false;
        // Private-by-default: asker + staff; published FAQs for everyone.
        return isStaffish(actor) || q.askerUserId === actor.id || q.isPublicFaq;
      })
    );
  }

  async answerQuestion(
    actorId: string,
    questionId: string,
    answer: string,
    publishAsFaq: boolean
  ): Promise<PostQuestion> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Only staff can answer");
    const question = store.postQuestions.find((q) => q.id === questionId);
    if (!question) throw new Error("Question not found");
    question.answer = answer;
    question.answeredByName = actor.displayName;
    question.answeredAt = nowIso();
    question.isPublicFaq = publishAsFaq;
    // Notify the asker.
    if (this.prefAllows(question.askerUserId, "direct_message")) {
      store.notifications.push({
        id: nextId("ntf"),
        userId: question.askerUserId,
        type: "direct_message",
        title: "Your question was answered",
        body: answer.slice(0, 120),
        url: "/feed",
        createdAt: nowIso(),
      });
    }
    return deepClone(question);
  }

  async getOpenQuestions(actorId: string): Promise<PostQuestion[]> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    return deepClone(
      store.postQuestions
        .filter((q) => !q.answer)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    );
  }

  /* ── notifications (#2) ───────────────────────────────────────────── */

  private prefAllows(userId: string, type: NotificationType): boolean {
    const prefs = store.notificationPrefs.get(userId);
    if (!prefs) return true;
    return prefs.enabled[type] !== false;
  }

  async getNotifications(actorId: string): Promise<AppNotification[]> {
    getActor(actorId);
    return deepClone(
      store.notifications
        .filter((n) => n.userId === actorId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  }

  async getUnreadNotificationCount(actorId: string): Promise<number> {
    getActor(actorId);
    return store.notifications.filter((n) => n.userId === actorId && !n.readAt).length;
  }

  async markNotificationRead(actorId: string, notificationId: string): Promise<void> {
    getActor(actorId);
    const notification = store.notifications.find(
      (n) => n.id === notificationId && n.userId === actorId
    );
    if (notification && !notification.readAt) notification.readAt = nowIso();
  }

  async markAllNotificationsRead(actorId: string): Promise<void> {
    getActor(actorId);
    for (const notification of store.notifications) {
      if (notification.userId === actorId && !notification.readAt) {
        notification.readAt = nowIso();
      }
    }
  }

  async getNotificationPrefs(actorId: string): Promise<NotificationPrefs> {
    getActor(actorId);
    return deepClone(
      store.notificationPrefs.get(actorId) ?? { userId: actorId, enabled: {} }
    );
  }

  async updateNotificationPrefs(
    actorId: string,
    prefs: Partial<Omit<NotificationPrefs, "userId">>
  ): Promise<NotificationPrefs> {
    getActor(actorId);
    const current = store.notificationPrefs.get(actorId) ?? {
      userId: actorId,
      enabled: {},
    };
    const merged: NotificationPrefs = {
      ...current,
      ...prefs,
      enabled: { ...current.enabled, ...prefs.enabled },
      userId: actorId,
    };
    store.notificationPrefs.set(actorId, merged);
    return deepClone(merged);
  }

  async broadcastNotification(
    actorId: string,
    input: {
      type: NotificationType;
      title: string;
      body: string;
      url?: string;
      audience: FeedAudience;
    }
  ): Promise<{ recipients: number }> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const recipients = store.users.filter(
      (user) =>
        user.id !== actor.id &&
        this.audienceMatchesUser(input.audience, user) &&
        this.prefAllows(user.id, input.type)
    );
    for (const recipient of recipients) {
      store.notifications.push({
        id: nextId("ntf"),
        userId: recipient.id,
        type: input.type,
        title: input.title,
        body: input.body,
        url: input.url,
        createdAt: nowIso(),
      });
    }
    return { recipients: recipients.length };
  }

  /* ── email (#1) ───────────────────────────────────────────────────── */

  async getEmailTemplates(actorId: string): Promise<EmailTemplate[]> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    return deepClone(store.emailTemplates);
  }

  async getEmailSends(actorId: string): Promise<EmailSend[]> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    return deepClone(
      [...store.emailSends].sort((a, b) =>
        (b.sentAt ?? b.scheduledFor ?? "").localeCompare(a.sentAt ?? a.scheduledFor ?? "")
      )
    );
  }

  async resolveAudience(actorId: string, audience: FeedAudience): Promise<User[]> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    return deepClone(
      store.users.filter(
        (user) => user.role === "parent" && this.audienceMatchesUser(audience, user)
      )
    );
  }

  async sendEmail(
    actorId: string,
    input: {
      templateId?: string;
      subject: string;
      body: string;
      category: EmailSend["category"];
      audience: EmailSend["audience"];
      scheduledFor?: string;
      testToSelf?: boolean;
    }
  ): Promise<EmailSend> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const recipients = input.testToSelf
      ? [actor]
      : await this.resolveAudience(actorId, input.audience);

    const send: EmailSend = {
      id: nextId("send"),
      templateId: input.templateId,
      subject: input.subject,
      body: input.body,
      category: input.category,
      audience: input.audience,
      scheduledFor: input.scheduledFor,
      sentAt: input.scheduledFor ? undefined : nowIso(),
      stats: {
        total: recipients.length,
        delivered: input.scheduledFor ? 0 : recipients.length,
        opened: 0,
      },
      createdByName: actor.displayName,
    };
    store.emailSends.push(send);
    return deepClone(send);
  }

  /* ── family calendar (#5) ─────────────────────────────────────────── */

  /**
   * Events relevant to a student via their enrollments. Scene-tagged
   * rehearsals go one step further: they only appear if the student's
   * published role (or the lead role they understudy) is called for one
   * of those scenes — the per-child, role-driven schedule.
   */
  private eventsForStudent(studentId: string): CalendarEvent[] {
    const enrollments = store.enrollments.filter(
      (e) => e.studentId === studentId && e.status === "enrolled"
    );
    const classIds = new Set(enrollments.map((e) => e.classId).filter(Boolean));
    const productionIds = new Set(enrollments.map((e) => e.productionId).filter(Boolean));
    return store.events.filter((event) => {
      const enrolled =
        (event.classId && classIds.has(event.classId)) ||
        (event.productionId && productionIds.has(event.productionId));
      if (!enrolled) return false;
      if (!event.sceneIds?.length || !event.productionId) return true;

      const { principal, understudy } = this.publishedRoleIdsForStudent(
        event.productionId,
        studentId
      );
      const called = new Set([...principal, ...understudy]);
      // Until casting is published the student holds no roles yet; keep the
      // rehearsal visible rather than hiding their schedule.
      if (called.size === 0) return true;
      return store.showScenes.some(
        (scene) =>
          event.sceneIds!.includes(scene.id) &&
          scene.roleIds.some((roleId) => called.has(roleId))
      );
    });
  }

  async getFamilyCalendar(actorId: string, familyId: string): Promise<FamilyCalendarEvent[]> {
    const actor = getActor(actorId);
    assertFamilyAccess(actor, familyId);
    const students = store.students.filter((s) => s.familyId === familyId);

    // Merge per-student events into family events keyed by event id.
    const byEvent = new Map<string, FamilyCalendarEvent>();
    for (const student of students) {
      for (const event of this.eventsForStudent(student.id)) {
        const existing = byEvent.get(event.id);
        if (existing) {
          existing.studentIds.push(student.id);
        } else {
          byEvent.set(event.id, { ...deepClone(event), studentIds: [student.id] });
        }
      }
    }

    // Approved pickup requests appear on the family calendar (#10).
    for (const request of store.pickupRequests) {
      if (request.familyId !== familyId || request.status !== "approved") continue;
      byEvent.set(`pickup-${request.id}`, {
        id: `pickup-${request.id}`,
        type: "other",
        title:
          request.kind === "late_dropoff"
            ? `Late drop-off approved (${request.dropOffTime})`
            : request.kind === "early_pickup"
              ? `Early pickup approved (${request.pickUpTime})`
              : `Extended care approved`,
        startsAt: `${request.startDate}T12:00:00.000Z`,
        endsAt: `${request.endDate}T12:30:00.000Z`,
        location: "Studio front desk",
        studentIds: [request.studentId],
      });
    }

    // Weekly private lessons appear as their next few occurrences, so the
    // household view really is every commitment in one place.
    for (const booking of store.lessonBookings) {
      if (booking.familyId !== familyId || booking.status !== "active") continue;
      const slot = store.lessonSlots.find((s) => s.id === booking.slotId);
      if (!slot) continue;
      const teacher = store.staff.find((s) => s.id === slot.teacherStaffId);
      const label =
        LESSON_DISCIPLINES.find((d) => d.value === slot.discipline)?.label ?? "Private";
      for (const startMs of upcomingLessonOccurrences(
        slot,
        Date.now(),
        LESSON_CALENDAR_WEEKS
      )) {
        const startsAt = new Date(startMs).toISOString();
        const id = `lesson-${booking.id}-${startsAt.slice(0, 10)}`;
        byEvent.set(id, {
          id,
          type: "class",
          title: `${label} lesson — ${teacher?.fullName ?? "NOVA PA"}`,
          startsAt,
          endsAt: new Date(startMs + slot.durationMin * 60_000).toISOString(),
          location: slot.location,
          contactName: teacher?.fullName,
          studentIds: [booking.studentId],
        });
      }
    }

    const events = [...byEvent.values()].sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt)
    );

    // Conflict detection across siblings: two events overlap in time but
    // involve different students at (potentially) different places.
    for (const a of events) {
      for (const b of events) {
        if (a.id >= b.id) continue;
        const overlap = a.startsAt < b.endsAt && b.startsAt < a.endsAt;
        const differentKids =
          a.studentIds.some((id) => !b.studentIds.includes(id)) ||
          b.studentIds.some((id) => !a.studentIds.includes(id));
        if (overlap && differentKids) {
          (a.conflictsWith ??= []).push(b.id);
          (b.conflictsWith ??= []).push(a.id);
        }
      }
    }
    return events;
  }

  async getAllEvents(actorId: string): Promise<CalendarEvent[]> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    return deepClone([...store.events].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
  }

  async getProductionCalendar(
    actorId: string,
    productionId: string
  ): Promise<CalendarEvent[]> {
    getActor(actorId);
    return deepClone(
      store.events
        .filter((event) => event.productionId === productionId)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    );
  }

  async getCalendarToken(actorId: string, familyId: string): Promise<string> {
    const actor = getActor(actorId);
    assertFamilyAccess(actor, familyId);
    let token = store.calendarTokens.get(familyId);
    if (!token) {
      token = `cal-tok-${familyId}-${Math.random().toString(36).slice(2, 10)}`;
      store.calendarTokens.set(familyId, token);
    }
    return token;
  }

  async getFamilyIdByCalendarToken(token: string): Promise<string | null> {
    for (const [familyId, candidate] of store.calendarTokens) {
      if (candidate === token) return familyId;
    }
    return null;
  }

  /* ── health forms (#9) ────────────────────────────────────────────── */

  async getHealthForm(
    actorId: string,
    studentId: string,
    seasonId: string
  ): Promise<HealthForm | null> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) return null;
    assertStudentAccess(actor, student);
    return deepClone(
      store.healthForms.find(
        (f) => f.studentId === studentId && f.seasonId === seasonId
      ) ?? null
    );
  }

  async getPreviousHealthForm(
    actorId: string,
    studentId: string,
    seasonId: string
  ): Promise<HealthForm | null> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) return null;
    assertStudentAccess(actor, student);
    const previous = store.healthForms
      .filter((f) => f.studentId === studentId && f.seasonId !== seasonId && f.signedAt)
      .sort((a, b) => (b.signedAt ?? "").localeCompare(a.signedAt ?? ""));
    return deepClone(previous[0] ?? null);
  }

  async saveHealthForm(
    actorId: string,
    studentId: string,
    seasonId: string,
    answers: HealthFormAnswers,
    signature?: { name: string; ip: string }
  ): Promise<HealthForm> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) throw new Error("Student not found");
    // Only the family signs health forms (not staff — they attest nothing).
    assertFamilyWrite(actor, student.familyId);

    const season = store.seasons.find((s) => s.id === seasonId);
    const expiresOn = season?.endsOn ?? "2027-06-15";

    let form = store.healthForms.find(
      (f) => f.studentId === studentId && f.seasonId === seasonId
    );
    if (!form) {
      form = {
        id: nextId("hf"),
        studentId,
        seasonId,
        answers,
        expiresOn,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      store.healthForms.push(form);
    } else {
      form.answers = answers;
      form.updatedAt = nowIso();
    }
    if (signature) {
      form.signedByName = signature.name;
      form.signedAt = nowIso();
      form.signedFromIp = signature.ip;
    }
    return deepClone(form);
  }

  async getHealthFormStatus(
    actorId: string,
    scope: { productionId?: string; classId?: string }
  ): Promise<Array<{ student: Student; form: HealthForm | null }>> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const currentSeason = store.seasons.find((s) => s.isCurrent);

    const enrolled = store.enrollments.filter((e) => {
      if (e.status !== "enrolled") return false;
      if (scope.productionId) return e.productionId === scope.productionId;
      if (scope.classId) return e.classId === scope.classId;
      return true;
    });
    const studentIds = [...new Set(enrolled.map((e) => e.studentId))];

    return studentIds
      .map((id) => store.students.find((s) => s.id === id))
      .filter((s): s is Student => !!s)
      .map((student) => ({
        student: deepClone(student),
        form: deepClone(
          store.healthForms.find(
            (f) =>
              f.studentId === student.id &&
              f.seasonId === currentSeason?.id &&
              f.signedAt
          ) ?? null
        ),
      }));
  }

  /* ── early pickup / late drop-off (#10) ───────────────────────────── */

  async getPickupRequestsForFamily(actorId: string, familyId: string): Promise<PickupRequest[]> {
    const actor = getActor(actorId);
    assertFamilyAccess(actor, familyId);
    return deepClone(
      store.pickupRequests
        .filter((r) => r.familyId === familyId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  }

  async createPickupRequest(
    actorId: string,
    input: Omit<
      PickupRequest,
      "id" | "familyId" | "status" | "createdAt" | "decisionNote" | "decidedByName" | "decidedAt" | "feeCents"
    >
  ): Promise<PickupRequest> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === input.studentId);
    if (!student) throw new Error("Student not found");
    assertFamilyWrite(actor, student.familyId);

    // Flat $5/day fee for extended care; org can change this later.
    const days =
      Math.max(
        1,
        Math.round(
          (new Date(input.endDate).getTime() - new Date(input.startDate).getTime()) / 86_400_000
        ) + 1
      );
    const request: PickupRequest = {
      ...input,
      id: nextId("pr"),
      familyId: student.familyId,
      feeCents: 500 * days,
      status: "pending",
      createdAt: nowIso(),
    };
    store.pickupRequests.push(request);
    return deepClone(request);
  }

  async markPickupArrived(
    actorId: string,
    requestId: string,
    byName: string
  ): Promise<{ request: PickupRequest; alreadyArrived: boolean }> {
    const actor = getActor(actorId);
    const request = store.pickupRequests.find((r) => r.id === requestId);
    if (!request) throw new Error("Request not found");
    assertFamilyWrite(actor, request.familyId);

    // Pressing twice must not restart the clock or fire a second alert: the
    // natural response to silence at a door is to press again.
    if (request.arrivedAt) return { request: deepClone(request), alreadyArrived: true };

    request.arrivedAt = nowIso();
    request.arrivedByName = byName;
    return { request: deepClone(request), alreadyArrived: false };
  }

  async getPickupRequestsForStaff(actorId: string): Promise<PickupRequest[]> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    return deepClone(
      [...store.pickupRequests].sort((a, b) => {
        if ((a.status === "pending") !== (b.status === "pending")) {
          return a.status === "pending" ? -1 : 1;
        }
        return b.createdAt.localeCompare(a.createdAt);
      })
    );
  }

  async decidePickupRequest(
    actorId: string,
    requestId: string,
    decision: { status: "approved" | "denied"; note?: string }
  ): Promise<PickupRequest> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const request = store.pickupRequests.find((r) => r.id === requestId);
    if (!request) throw new Error("Request not found");
    request.status = decision.status;
    request.decisionNote = decision.note;
    request.decidedByName = actor.displayName;
    request.decidedAt = nowIso();

    // Notify the family (#10): decision notification with note.
    const familyParents = store.users.filter(
      (u) => u.role === "parent" && u.familyId === request.familyId
    );
    const student = store.students.find((s) => s.id === request.studentId);
    for (const parent of familyParents) {
      store.notifications.push({
        id: nextId("ntf"),
        userId: parent.id,
        type: "form_due",
        title: `Pick-up request ${decision.status}`,
        body: `${student?.firstName ?? "Your student"}: ${decision.note ?? "See details in the app."}`,
        url: "/family/pickup",
        createdAt: nowIso(),
      });
    }
    return deepClone(request);
  }

  /* ── registration integration (#8) ────────────────────────────────── */

  async syncRegistration(
    actorId: string,
    snapshot: RegistrationSnapshot,
    trigger: SyncRun["trigger"]
  ): Promise<SyncRun> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const startedAt = nowIso();
    const plan = reconcile({
      snapshot,
      families: store.families,
      guardians: store.guardians,
      students: store.students,
      enrollments: store.enrollments,
      productions: store.productions,
      classes: store.classes,
      links: store.accountLinks,
    });

    // Persist auto-discovered account links.
    for (const link of plan.autoLinks) {
      const already = store.accountLinks.some(
        (existing) =>
          existing.familyId === link.familyId && existing.source === link.source
      );
      if (!already) store.accountLinks.push({ ...link });
    }

    for (const create of plan.creates) {
      const enrollment = {
        id: nextId("enr"),
        studentId: create.studentId,
        classId: create.classId,
        productionId: create.productionId,
        status: create.status,
        balanceCents: create.balanceCents,
        source: "registration_portal" as const,
        offeringCategory: create.offeringCategory,
        amountPaidCents: create.amountPaidCents,
        sessionStartsOn: create.sessionStartsOn,
        sessionEndsOn: create.sessionEndsOn,
        createdAt: nowIso(),
      };
      store.enrollments.push(enrollment);
      store.enrollmentExternalIds.set(enrollment.id, create.externalId);
    }

    for (const update of plan.updates) {
      const enrollment = store.enrollments.find((e) => e.id === update.enrollmentId);
      if (!enrollment) continue;
      if (update.balanceCents !== undefined) {
        enrollment.balanceCents = update.balanceCents;
      }
      if (update.status !== undefined) enrollment.status = update.status;
      if (update.amountPaidCents !== undefined) {
        enrollment.amountPaidCents = update.amountPaidCents;
      }
      if (update.offeringCategory !== undefined) {
        enrollment.offeringCategory = update.offeringCategory;
      }
      if (update.sessionStartsOn !== undefined) {
        enrollment.sessionStartsOn = update.sessionStartsOn;
        enrollment.sessionEndsOn = update.sessionEndsOn;
      }
    }

    const run: SyncRun = {
      id: nextId("sync"),
      source: snapshot.source,
      startedAt,
      finishedAt: nowIso(),
      status: plan.issues.length > 0 ? "partial" : "success",
      trigger,
      counts: plan.counts,
      issues: plan.issues,
    };
    store.syncRuns.push(run);

    // Notify families whose balance changed, so a new charge isn't silent.
    for (const update of plan.updates) {
      if (update.balanceCents === undefined || update.balanceCents <= 0) continue;
      const enrollment = store.enrollments.find((e) => e.id === update.enrollmentId);
      const student = store.students.find((s) => s.id === enrollment?.studentId);
      if (!student) continue;
      const parents = store.users.filter(
        (u) => u.role === "parent" && u.familyId === student.familyId
      );
      for (const parent of parents) {
        if (!this.prefAllows(parent.id, "payment_due")) continue;
        store.notifications.push({
          id: nextId("ntf"),
          userId: parent.id,
          type: "payment_due",
          title: "Balance updated",
          body: `${student.preferredName ?? student.firstName} has an outstanding balance.`,
          url: "/dashboard",
          createdAt: nowIso(),
        });
      }
    }

    return deepClone(run);
  }

  async recordSyncFailure(
    actorId: string,
    source: RegistrationSource,
    trigger: SyncRun["trigger"],
    error: string
  ): Promise<SyncRun> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const run: SyncRun = {
      id: nextId("sync"),
      source,
      startedAt: nowIso(),
      finishedAt: nowIso(),
      status: "failed",
      trigger,
      counts: {
        accountsSeen: 0,
        enrollmentsSeen: 0,
        enrollmentsCreated: 0,
        enrollmentsUpdated: 0,
        balancesUpdated: 0,
      },
      issues: [],
      error,
    };
    store.syncRuns.push(run);
    return deepClone(run);
  }

  async getSyncRuns(actorId: string): Promise<SyncRun[]> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    return deepClone(
      [...store.syncRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    );
  }

  async getAccountLinks(actorId: string): Promise<AccountLink[]> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    return deepClone(store.accountLinks);
  }

  async linkAccount(
    actorId: string,
    link: Omit<AccountLink, "linkedAt" | "autoMatched">
  ): Promise<AccountLink> {
    const actor = getActor(actorId);
    if (!isAdmin(actor)) throw new AccessDeniedError("Admin only");
    const existing = store.accountLinks.find(
      (candidate) =>
        candidate.familyId === link.familyId && candidate.source === link.source
    );
    if (existing) {
      Object.assign(existing, link, { linkedAt: nowIso(), autoMatched: false });
      return deepClone(existing);
    }
    const created: AccountLink = { ...link, linkedAt: nowIso(), autoMatched: false };
    store.accountLinks.push(created);
    return deepClone(created);
  }

  async unlinkAccount(
    actorId: string,
    familyId: string,
    source: RegistrationSource
  ): Promise<void> {
    const actor = getActor(actorId);
    if (!isAdmin(actor)) throw new AccessDeniedError("Admin only");
    store.accountLinks = store.accountLinks.filter(
      (link) => !(link.familyId === familyId && link.source === source)
    );
  }

  async getAccountLinkForFamily(
    actorId: string,
    familyId: string
  ): Promise<AccountLink | null> {
    const actor = getActor(actorId);
    assertFamilyAccess(actor, familyId);
    return deepClone(store.accountLinks.find((link) => link.familyId === familyId) ?? null);
  }

  /* ── spirit buttons store (#11) ───────────────────────────────────── */

  async getButtonTemplates(productionId?: string): Promise<ButtonTemplate[]> {
    return deepClone(
      store.buttonTemplates.filter(
        (template) =>
          template.isActive && (!productionId || template.productionId === productionId)
      )
    );
  }

  async upsertButtonTemplate(
    actorId: string,
    template: Omit<ButtonTemplate, "id"> & { id?: string }
  ): Promise<ButtonTemplate> {
    const actor = getActor(actorId);
    if (!isAdmin(actor)) throw new AccessDeniedError("Admin only");
    if (template.id) {
      const existing = store.buttonTemplates.find((t) => t.id === template.id);
      if (existing) {
        Object.assign(existing, template);
        return deepClone(existing);
      }
    }
    const created: ButtonTemplate = { ...template, id: template.id ?? nextId("tpl") };
    store.buttonTemplates.push(created);
    return deepClone(created);
  }

  private cartFor(userId: string): CartItem[] {
    const cart = store.carts.get(userId) ?? [];
    store.carts.set(userId, cart);
    return cart;
  }

  async getCart(actorId: string): Promise<CartItem[]> {
    getActor(actorId);
    return deepClone(this.cartFor(actorId));
  }

  async addToCart(
    actorId: string,
    design: ButtonDesign,
    quantity: number
  ): Promise<CartItem[]> {
    const actor = getActor(actorId);
    if (actor.role !== "parent" && !isStaffish(actor)) {
      throw new AccessDeniedError("Only families can order buttons");
    }
    if (quantity < 1) throw new Error("Quantity must be at least 1");

    const cart = this.cartFor(actorId);
    cart.push({
      ...design,
      id: nextId("cart"),
      quantity,
      unitPriceCents: BUTTON_PRICES_CENTS[design.size],
      productType: "spirit_button",
      displayName: `${design.size}" spirit button — ${design.studentName}`,
    });
    return deepClone(cart);
  }

  async updateCartItem(
    actorId: string,
    itemId: string,
    quantity: number
  ): Promise<CartItem[]> {
    getActor(actorId);
    const cart = this.cartFor(actorId);
    const item = cart.find((entry) => entry.id === itemId);
    if (item) {
      if (quantity < 1) {
        store.carts.set(
          actorId,
          cart.filter((entry) => entry.id !== itemId)
        );
      } else {
        item.quantity = quantity;
      }
    }
    return deepClone(this.cartFor(actorId));
  }

  async removeCartItem(actorId: string, itemId: string): Promise<CartItem[]> {
    getActor(actorId);
    const cart = this.cartFor(actorId).filter((entry) => entry.id !== itemId);
    store.carts.set(actorId, cart);
    return deepClone(cart);
  }

  async clearCart(actorId: string): Promise<void> {
    getActor(actorId);
    store.carts.set(actorId, []);
  }

  async createOrder(actorId: string, paymentRef: string): Promise<ButtonOrder> {
    const actor = getActor(actorId);
    if (!actor.familyId) throw new AccessDeniedError("Only families can order buttons");
    const cart = this.cartFor(actorId);
    if (cart.length === 0) throw new Error("Cart is empty");

    const items = cart.map((item) => ({ ...deepClone(item) }));
    const subtotalCents = items.reduce(
      (sum, item) => sum + item.unitPriceCents * item.quantity,
      0
    );
    // Every item in a cart shares a production (the store is per-show).
    const template = store.buttonTemplates.find((t) => t.id === items[0].templateId);

    const order: ButtonOrder = {
      id: nextId("ord"),
      familyId: actor.familyId,
      reference: `NPA-${store.orderSequence++}`,
      items,
      subtotalCents,
      status: "new",
      paymentRef,
      placedByName: actor.displayName,
      productionId: template?.productionId ?? "",
      createdAt: nowIso(),
      statusUpdatedAt: nowIso(),
    };
    store.orders.push(order);
    store.carts.set(actorId, []);
    return deepClone(order);
  }

  async markOrderPaid(
    orderReference: string,
    paymentRef: string
  ): Promise<ButtonOrder | null> {
    // Called from the payment webhook — no actor session available, so this
    // deliberately takes no actorId. It can only flip an unpaid order to paid.
    const order = store.orders.find((o) => o.reference === orderReference);
    if (!order) return null;
    if (!order.paidAt) {
      order.paidAt = nowIso();
      order.paymentRef = paymentRef;
    }
    return deepClone(order);
  }

  async getOrdersForFamily(actorId: string, familyId: string): Promise<ButtonOrder[]> {
    const actor = getActor(actorId);
    assertFamilyAccess(actor, familyId);
    return deepClone(
      store.orders
        .filter((order) => order.familyId === familyId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  }

  async getOrder(actorId: string, orderId: string): Promise<ButtonOrder | null> {
    const actor = getActor(actorId);
    const order = store.orders.find((o) => o.id === orderId);
    if (!order) return null;
    assertFamilyAccess(actor, order.familyId);
    return deepClone(order);
  }

  async getAllOrders(actorId: string, status?: OrderStatus): Promise<ButtonOrder[]> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    return deepClone(
      store.orders
        .filter((order) => !status || order.status === status)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    );
  }

  async updateOrderStatus(
    actorId: string,
    orderId: string,
    status: OrderStatus,
    note?: string
  ): Promise<ButtonOrder> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const order = store.orders.find((o) => o.id === orderId);
    if (!order) throw new Error("Order not found");
    order.status = status;
    order.statusUpdatedAt = nowIso();
    if (note !== undefined) order.adminNote = note;

    // Tell the family when their buttons are ready to collect.
    if (status === "ready" || status === "delivered") {
      const parents = store.users.filter(
        (u) => u.role === "parent" && u.familyId === order.familyId
      );
      for (const parent of parents) {
        store.notifications.push({
          id: nextId("ntf"),
          userId: parent.id,
          type: "broadcast",
          title:
            status === "ready"
              ? `Order ${order.reference} is ready`
              : `Order ${order.reference} delivered`,
          body:
            status === "ready"
              ? "Your spirit buttons are ready to pick up at the front desk."
              : "Your spirit buttons have been handed off. Enjoy!",
          url: "/store/orders",
          createdAt: nowIso(),
        });
      }
    }
    return deepClone(order);
  }

  /* ── photos & face matching (#6) ──────────────────────────────────── */

  async grantFaceConsent(
    actorId: string,
    studentId: string,
    referenceImageUrls: string[]
  ): Promise<{ embeddingsCreated: number }> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) throw new Error("Student not found");
    // Only a parent of this child may consent — never staff, never admin.
    if (actor.role !== "parent" || actor.familyId !== student.familyId) {
      throw new AccessDeniedError(
        "Only a parent or guardian of this student can give face-matching consent"
      );
    }
    if (
      referenceImageUrls.length < MIN_REFERENCE_PHOTOS ||
      referenceImageUrls.length > MAX_REFERENCE_PHOTOS
    ) {
      throw new Error(
        `Upload between ${MIN_REFERENCE_PHOTOS} and ${MAX_REFERENCE_PHOTOS} reference photos`
      );
    }

    const faceProvider = getFaceMatchProvider();
    let created = 0;

    for (const imageUrl of referenceImageUrls) {
      store.referencePhotos.push({
        id: nextId("ref"),
        studentId,
        imageUrl,
        uploadedAt: nowIso(),
      });
      const faces = await faceProvider.embedFaces(imageUrl);
      // A reference photo with no detectable face is silently useless, so
      // surface it rather than pretending consent produced something.
      for (const face of faces) {
        store.embeddings.push({
          id: nextId("emb"),
          studentId,
          vector: face.vector,
          detectionConfidence: face.detectionConfidence,
          createdAt: nowIso(),
        });
        created += 1;
      }
    }

    if (created === 0) {
      // Roll back the reference photos — consent without a usable face is
      // just retained photos of a child for no purpose.
      store.referencePhotos = store.referencePhotos.filter(
        (photo) => photo.studentId !== studentId
      );
      throw new Error(
        "We couldn't find a face in those photos. Try clearer, front-facing photos."
      );
    }

    student.consents.faceMatching = true;
    student.updatedAt = nowIso();

    store.consentEvents.push({
      id: nextId("cons"),
      studentId,
      action: "granted",
      actorName: actor.displayName,
      createdAt: nowIso(),
    });

    return { embeddingsCreated: created };
  }

  async revokeFaceConsent(actorId: string, studentId: string): Promise<ConsentEvent> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) throw new Error("Student not found");
    // A parent may revoke; an admin may also revoke on request.
    if (!isAdmin(actor) && (actor.role !== "parent" || actor.familyId !== student.familyId)) {
      throw new AccessDeniedError("Only a parent or an admin can revoke consent");
    }

    // Delete everything derived from this child's face, immediately —
    // well inside the 24-hour promise in PRIVACY.md.
    const embeddingsBefore = store.embeddings.length;
    store.embeddings = store.embeddings.filter(
      (embedding) => embedding.studentId !== studentId
    );
    const embeddingsDeleted = embeddingsBefore - store.embeddings.length;

    const matchesBefore = store.matches.length;
    store.matches = store.matches.filter((match) => match.studentId !== studentId);
    const matchesDeleted = matchesBefore - store.matches.length;

    const referencesBefore = store.referencePhotos.length;
    store.referencePhotos = store.referencePhotos.filter(
      (photo) => photo.studentId !== studentId
    );
    const referencePhotosDeleted = referencesBefore - store.referencePhotos.length;

    student.consents.faceMatching = false;
    student.updatedAt = nowIso();

    const event: ConsentEvent = {
      id: nextId("cons"),
      studentId,
      action: "revoked",
      actorName: actor.displayName,
      createdAt: nowIso(),
      embeddingsDeleted,
      matchesDeleted,
      referencePhotosDeleted,
    };
    store.consentEvents.push(event);
    return deepClone(event);
  }

  async getConsentHistory(actorId: string, studentId: string): Promise<ConsentEvent[]> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) return [];
    assertStudentAccess(actor, student);
    return deepClone(
      store.consentEvents
        .filter((event) => event.studentId === studentId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  }

  async getReferencePhotos(actorId: string, studentId: string): Promise<ReferencePhoto[]> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) return [];
    // Reference photos are the family's own uploads — family only, not staff.
    if (!isAdmin(actor) && actor.familyId !== student.familyId) {
      throw new AccessDeniedError("Not your student");
    }
    return deepClone(store.referencePhotos.filter((photo) => photo.studentId === studentId));
  }

  async countEmbeddingsForStudent(actorId: string, studentId: string): Promise<number> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) return 0;
    if (!isAdmin(actor) && actor.familyId !== student.familyId) {
      throw new AccessDeniedError("Not your student");
    }
    return store.embeddings.filter((embedding) => embedding.studentId === studentId).length;
  }

  async getGalleries(actorId: string): Promise<Gallery[]> {
    getActor(actorId);
    return deepClone(
      [...store.galleries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  }

  async getGalleryPhotos(actorId: string, galleryId: string): Promise<GalleryPhoto[]> {
    getActor(actorId);
    return deepClone(store.galleryPhotos.filter((photo) => photo.galleryId === galleryId));
  }

  async getMatchesForFamily(
    actorId: string,
    familyId: string
  ): Promise<Array<{ match: PhotoMatch; photo: GalleryPhoto; studentName: string }>> {
    const actor = getActor(actorId);
    // Matches are visible to the family and to admins — NOT to staff at
    // large, and never to another family (PRIVACY.md).
    if (!isAdmin(actor) && actor.familyId !== familyId) {
      throw new AccessDeniedError("Not your family");
    }

    const familyStudents = store.students.filter((s) => s.familyId === familyId);
    const studentIds = new Set(familyStudents.map((s) => s.id));
    const nameById = new Map(
      familyStudents.map((s) => [s.id, s.preferredName ?? s.firstName])
    );

    return store.matches
      .filter((match) => studentIds.has(match.studentId) && match.state !== "rejected")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .flatMap((match) => {
        const photo = store.galleryPhotos.find((p) => p.id === match.photoId);
        if (!photo) return [];
        return [
          {
            match: deepClone(match),
            photo: deepClone(photo),
            studentName: nameById.get(match.studentId) ?? "",
          },
        ];
      });
  }

  private assertMatchOwner(actorId: string, matchId: string): PhotoMatch {
    const actor = getActor(actorId);
    const match = store.matches.find((m) => m.id === matchId);
    if (!match) throw new Error("Match not found");
    const student = store.students.find((s) => s.id === match.studentId);
    if (!student) throw new Error("Student not found");
    if (!isAdmin(actor) && actor.familyId !== student.familyId) {
      throw new AccessDeniedError("Not your match to correct");
    }
    return match;
  }

  async rejectMatch(actorId: string, matchId: string): Promise<void> {
    const match = this.assertMatchOwner(actorId, matchId);
    // Keep the row in "rejected" state: it's how we remember never to
    // re-assert this pairing on the next matching run.
    match.state = "rejected";
    match.correctedAt = nowIso();
  }

  async confirmMatch(actorId: string, matchId: string): Promise<void> {
    const match = this.assertMatchOwner(actorId, matchId);
    match.state = "confirmed";
    match.correctedAt = nowIso();

    // Fold the confirmed face into the student's reference set so future
    // matching gets better at this child specifically.
    const photoEmbedding = store.embeddings.find(
      (embedding) => embedding.photoId === match.photoId
    );
    if (photoEmbedding) {
      store.embeddings.push({
        id: nextId("emb"),
        studentId: match.studentId,
        vector: [...photoEmbedding.vector],
        detectionConfidence: photoEmbedding.detectionConfidence,
        createdAt: nowIso(),
      });
    }
  }

  async ingestGallery(
    actorId: string,
    gallery: Gallery,
    photos: GalleryPhoto[]
  ): Promise<{ photosIngested: number }> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const existing = store.galleries.find((g) => g.externalId === gallery.externalId);
    if (existing) {
      Object.assign(existing, gallery, { ingestedAt: nowIso() });
    } else {
      store.galleries.push({ ...deepClone(gallery), ingestedAt: nowIso() });
    }

    let ingested = 0;
    for (const photo of photos) {
      if (store.galleryPhotos.some((p) => p.externalId === photo.externalId)) continue;
      store.galleryPhotos.push(deepClone(photo));
      ingested += 1;
    }
    return { photosIngested: ingested };
  }

  /**
   * Background matching pass. Only students with ACTIVE consent are ever
   * passed to the matcher — this is the invariant the privacy promise
   * rests on, and it is pinned by tests.
   */
  async runMatching(
    actorId: string
  ): Promise<{ photosScanned: number; matchesCreated: number }> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const faceProvider = getFaceMatchProvider();

    const candidates: CandidateStudent[] = store.students
      .filter((student) => student.consents.faceMatching)
      .map((student) => ({
        studentId: student.id,
        embeddings: store.embeddings.filter(
          (embedding) => embedding.studentId === student.id
        ),
        rejectedPhotoIds: new Set(
          store.matches
            .filter((match) => match.studentId === student.id && match.state === "rejected")
            .map((match) => match.photoId)
        ),
      }))
      .filter((candidate) => candidate.embeddings.length > 0);

    let photosScanned = 0;
    let matchesCreated = 0;

    for (const photo of store.galleryPhotos) {
      photosScanned += 1;

      // Embed the photo's faces once and cache them.
      let faces = store.embeddings.filter((embedding) => embedding.photoId === photo.id);
      if (faces.length === 0) {
        const detected = await faceProvider.embedFaces(photo.thumbnailUrl);
        faces = detected.map((face) => {
          const embedding: FaceEmbedding = {
            id: nextId("emb"),
            photoId: photo.id,
            vector: face.vector,
            detectionConfidence: face.detectionConfidence,
            createdAt: nowIso(),
          };
          store.embeddings.push(embedding);
          return embedding;
        });
      }

      for (const face of faces) {
        const result = matchFace(face, photo.id, candidates);
        if (!result) continue;

        const already = store.matches.find(
          (match) =>
            match.studentId === result.studentId && match.photoId === result.photoId
        );
        if (already) continue;

        store.matches.push({
          id: nextId("match"),
          studentId: result.studentId,
          photoId: result.photoId,
          similarity: result.similarity,
          state: "matched",
          createdAt: nowIso(),
        });
        matchesCreated += 1;

        // Tell the family there are new photos of their child.
        const student = store.students.find((s) => s.id === result.studentId);
        if (!student) continue;
        const parents = store.users.filter(
          (u) => u.role === "parent" && u.familyId === student.familyId
        );
        for (const parent of parents) {
          if (!this.prefAllows(parent.id, "photos_posted")) continue;
          const alreadyNotified = store.notifications.some(
            (n) =>
              n.userId === parent.id &&
              n.type === "photos_posted" &&
              n.body.includes(student.preferredName ?? student.firstName)
          );
          if (alreadyNotified) continue;
          store.notifications.push({
            id: nextId("ntf"),
            userId: parent.id,
            type: "photos_posted",
            title: "New photos",
            body: `We found new photos of ${student.preferredName ?? student.firstName}.`,
            url: "/photos",
            createdAt: nowIso(),
          });
        }
      }
    }

    return { photosScanned, matchesCreated };
  }

  /* ── private reviews (#15) ────────────────────────────────────────── */

  private subjectName(subjectType: ReviewSubjectType, subjectId: string): string {
    if (subjectType === "class") {
      return store.classes.find((c) => c.id === subjectId)?.name ?? "Class";
    }
    return store.productions.find((p) => p.id === subjectId)?.title ?? "Production";
  }

  /** Staff attached to a class or production, for attributing a review. */
  private staffForSubject(subjectType: ReviewSubjectType, subjectId: string): string[] {
    if (subjectType === "class") {
      return store.classes.find((c) => c.id === subjectId)?.staffIds ?? [];
    }
    const production = store.productions.find((p) => p.id === subjectId);
    return production?.directorStaffId ? [production.directorStaffId] : [];
  }

  /** Is this family enrolled in the thing they're reviewing? */
  private familyIsEnrolled(familyId: string, window: ReviewWindow): boolean {
    const studentIds = new Set(
      store.students.filter((s) => s.familyId === familyId).map((s) => s.id)
    );
    return store.enrollments.some(
      (enrollment) =>
        studentIds.has(enrollment.studentId) &&
        enrollment.status === "enrolled" &&
        (window.subjectType === "class"
          ? enrollment.classId === window.subjectId
          : enrollment.productionId === window.subjectId)
    );
  }

  async getOpenReviewWindows(
    actorId: string
  ): Promise<Array<{ window: ReviewWindow; subjectName: string; alreadySubmitted: boolean }>> {
    const actor = getActor(actorId);
    if (!actor.familyId) return [];
    const now = nowIso();

    return store.reviewWindows
      .filter((window) => window.opensAt <= now && window.closesAt >= now)
      .filter((window) => this.familyIsEnrolled(actor.familyId!, window))
      .map((window) => ({
        window: deepClone(window),
        subjectName: this.subjectName(window.subjectType, window.subjectId),
        alreadySubmitted: store.reviews.some(
          (review) =>
            review.windowId === window.id && review.familyId === actor.familyId
        ),
      }));
  }

  async submitReview(
    actorId: string,
    input: {
      windowId: string;
      scores: ReviewScores;
      comment: string;
      isAnonymous: boolean;
    }
  ): Promise<Review> {
    const actor = getActor(actorId);
    if (actor.role !== "parent" || !actor.familyId) {
      throw new AccessDeniedError("Only families submit reviews");
    }

    const window = store.reviewWindows.find((w) => w.id === input.windowId);
    if (!window) throw new Error("Review window not found");

    const now = nowIso();
    if (window.opensAt > now || window.closesAt < now) {
      throw new Error("This review window isn't open");
    }
    if (!this.familyIsEnrolled(actor.familyId, window)) {
      throw new AccessDeniedError("You can only review something you're enrolled in");
    }
    const duplicate = store.reviews.some(
      (review) => review.windowId === window.id && review.familyId === actor.familyId
    );
    if (duplicate) throw new Error("You've already submitted a review for this");

    for (const value of Object.values(input.scores)) {
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        throw new Error("Each rating must be between 1 and 5");
      }
    }

    const review: Review = {
      id: nextId("rev"),
      windowId: window.id,
      subjectType: window.subjectType,
      subjectId: window.subjectId,
      reviewerUserId: actor.id,
      reviewerName: actor.displayName,
      familyId: actor.familyId,
      staffIds: this.staffForSubject(window.subjectType, window.subjectId),
      scores: { ...input.scores },
      comment: input.comment,
      isAnonymous: input.isAnonymous,
      createdAt: now,
    };
    store.reviews.push(review);
    return deepClone(review);
  }

  async getMyReviews(actorId: string): Promise<Review[]> {
    const actor = getActor(actorId);
    if (!actor.familyId) return [];
    return deepClone(
      store.reviews
        .filter((review) => review.familyId === actor.familyId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  }

  async getReviewsForStaff(
    actorId: string,
    staffId: string
  ): Promise<{ reviews: StaffReviewView[]; aggregate: ReviewAggregate; trend: TrendPoint[] }> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    // A staff member may only read their OWN feedback; admins may read anyone's.
    if (!isAdmin(actor) && actor.staffId !== staffId) {
      throw new AccessDeniedError("You can only see feedback about your own work");
    }

    const relevant = store.reviews.filter((review) => review.staffIds.includes(staffId));
    return {
      // Identity stripped here — the return type has no reviewer field at all.
      reviews: relevant
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(toStaffView),
      aggregate: aggregate(relevant, "class", staffId),
      trend: trend(relevant),
    };
  }

  async getAllReviews(actorId: string): Promise<Review[]> {
    const actor = getActor(actorId);
    if (!isAdmin(actor)) throw new AccessDeniedError("Admin only");
    return deepClone(
      [...store.reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  }

  async getReviewAggregate(
    actorId: string,
    subjectType: ReviewSubjectType,
    subjectId: string
  ): Promise<{ aggregate: ReviewAggregate; trend: TrendPoint[] }> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const relevant = store.reviews.filter(
      (review) => review.subjectType === subjectType && review.subjectId === subjectId
    );
    return {
      aggregate: aggregate(relevant, subjectType, subjectId),
      trend: trend(relevant),
    };
  }

  async flagReview(actorId: string, reviewId: string, reason: string): Promise<Review> {
    const actor = getActor(actorId);
    if (!isAdmin(actor)) throw new AccessDeniedError("Admin only");
    const review = store.reviews.find((r) => r.id === reviewId);
    if (!review) throw new Error("Review not found");
    review.flaggedAt = nowIso();
    review.flagReason = reason;
    review.resolvedAt = undefined;
    review.resolutionNote = undefined;
    return deepClone(review);
  }

  async resolveReview(actorId: string, reviewId: string, note: string): Promise<Review> {
    const actor = getActor(actorId);
    if (!isAdmin(actor)) throw new AccessDeniedError("Admin only");
    const review = store.reviews.find((r) => r.id === reviewId);
    if (!review) throw new Error("Review not found");
    review.resolvedAt = nowIso();
    review.resolutionNote = note;
    return deepClone(review);
  }

  async createReviewWindow(
    actorId: string,
    input: Omit<ReviewWindow, "id">
  ): Promise<ReviewWindow> {
    const actor = getActor(actorId);
    if (!isAdmin(actor)) throw new AccessDeniedError("Admin only");
    const window: ReviewWindow = { ...input, id: nextId("rw") };
    store.reviewWindows.push(window);
    return deepClone(window);
  }

  /* ── student materials (#4) ───────────────────────────────────────── */

  /** Shared guard: only this student's family (or an admin) may upload. */
  private studentForWrite(actorId: string, studentId: string): Student {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) throw new Error("Student not found");
    assertFamilyWrite(actor, student.familyId);
    return student;
  }

  private async store(
    bucket: StorageBucket,
    path: string,
    dataUrl: string
  ): Promise<string> {
    // Type and size are enforced here, not only in the browser.
    assertUploadAllowed(bucket, dataUrl);
    const stored = await getStorageProvider().upload(bucket, path, dataUrl);
    return stored.url;
  }

  async setHeadshot(
    actorId: string,
    studentId: string,
    files: { webDataUrl: string; printDataUrl: string }
  ): Promise<Student> {
    const student = this.studentForWrite(actorId, studentId);
    student.headshotUrl = await this.store(
      "headshots",
      `${studentId}/web.jpg`,
      files.webDataUrl
    );
    student.headshotPrintUrl = await this.store(
      "headshots",
      `${studentId}/print.jpg`,
      files.printDataUrl
    );
    student.updatedAt = nowIso();
    return deepClone(student);
  }

  async setResumePdf(actorId: string, studentId: string, dataUrl: string): Promise<Student> {
    const student = this.studentForWrite(actorId, studentId);
    student.resumePdfUrl = await this.store("resumes", `${studentId}/resume.pdf`, dataUrl);
    student.updatedAt = nowIso();
    return deepClone(student);
  }

  async setAuditionAudio(
    actorId: string,
    studentId: string,
    dataUrl: string
  ): Promise<Student> {
    const student = this.studentForWrite(actorId, studentId);
    student.auditionAudioUrl = await this.store(
      "audition-audio",
      `${studentId}/audition`,
      dataUrl
    );
    student.updatedAt = nowIso();
    return deepClone(student);
  }

  async clearAuditionAudio(actorId: string, studentId: string): Promise<Student> {
    const student = this.studentForWrite(actorId, studentId);
    if (student.auditionAudioUrl) {
      await getStorageProvider().remove("audition-audio", `${studentId}/audition`);
      student.auditionAudioUrl = undefined;
      student.updatedAt = nowIso();
    }
    return deepClone(student);
  }

  async saveResumeCredits(
    actorId: string,
    studentId: string,
    credits: ResumeCredit[]
  ): Promise<Student> {
    const student = this.studentForWrite(actorId, studentId);
    student.resumeCredits = deepClone(credits);
    student.updatedAt = nowIso();
    return deepClone(student);
  }

  /* ── household document vault (#3) ────────────────────────────────── */

  async getFamilyDocuments(actorId: string, familyId: string): Promise<FamilyDocument[]> {
    const actor = getActor(actorId);
    assertFamilyAccess(actor, familyId);
    return deepClone(
      store.familyDocuments
        .filter((document) => document.familyId === familyId)
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    );
  }

  async uploadFamilyDocument(
    actorId: string,
    familyId: string,
    input: {
      name: string;
      category: DocumentCategory;
      dataUrl: string;
      studentId?: string;
    }
  ): Promise<FamilyDocument> {
    const actor = getActor(actorId);
    // Staff may file a document into a family's vault (a signed waiver they
    // received on paper), so this is read-access plus a staff allowance.
    assertFamilyAccess(actor, familyId);

    assertUploadAllowed("family-documents", input.dataUrl);
    const path = `${familyId}/${nextId("doc")}`;
    const stored = await getStorageProvider().upload(
      "family-documents",
      path,
      input.dataUrl
    );

    const document: FamilyDocument = {
      id: nextId("doc"),
      familyId,
      studentId: input.studentId,
      name: input.name,
      category: input.category,
      fileUrl: stored.url,
      storagePath: path,
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      uploadedAt: nowIso(),
      uploadedByName: actor.displayName,
      uploadedByStaff: isStaffish(actor),
    };
    store.familyDocuments.push(document);
    return deepClone(document);
  }

  async deleteFamilyDocument(actorId: string, documentId: string): Promise<void> {
    const actor = getActor(actorId);
    const document = store.familyDocuments.find((d) => d.id === documentId);
    if (!document) return;
    assertFamilyAccess(actor, document.familyId);

    // A family can remove what they uploaded; only an admin can remove a
    // document staff filed (e.g. a countersigned waiver).
    if (document.uploadedByStaff && !isAdmin(actor)) {
      throw new AccessDeniedError(
        "This document was filed by NOVA PA staff. Contact the office to have it removed."
      );
    }

    await getStorageProvider().remove("family-documents", document.storagePath);
    store.familyDocuments = store.familyDocuments.filter((d) => d.id !== documentId);
  }

  /* ── Dependent Care FSA statement ─────────────────────────────────── */

  async getFsaStatement(
    actorId: string,
    studentId: string,
    period: { start: string; end: string }
  ): Promise<FsaStatement> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) throw new Error("Student not found");
    assertStudentAccess(actor, student);

    const family = store.families.find((f) => f.id === student.familyId);
    if (!family) throw new Error("Family not found");

    return buildFsaStatement({
      student: deepClone(student),
      family: deepClone(family),
      guardians: store.guardians.filter((g) => g.familyId === family.id),
      enrollments: store.enrollments,
      classes: store.classes,
      productions: store.productions,
      periodStart: period.start,
      periodEnd: period.end,
      // No override: the amount comes from enrollment.amountPaidCents, the same
      // field the Supabase adapter reads. This used to invent a figure per
      // enrollment, which made the mock disagree with production about the one
      // number on the page that has to be right.
    });
  }

  /* ── families directory — staff and admin only (#3) ───────────────── */

  async getFamiliesDirectory(actorId: string): Promise<
    Array<{ family: Family; students: Student[]; guardians: Guardian[] }>
  > {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) {
      throw new AccessDeniedError("The family directory is staff-only");
    }

    return store.families
      .map((family) => ({
        family: deepClone(family),
        students: store.students
          .filter((student) => student.familyId === family.id)
          .map((student) => deepClone(student)),
        guardians: store.guardians
          .filter((guardian) => guardian.familyId === family.id)
          .map((guardian) => deepClone(guardian)),
      }))
      .sort((a, b) => a.family.name.localeCompare(b.family.name));
  }

  /* ── staff self-edit with admin approval (#14) ────────────────────── */

  async submitStaffProfileChanges(
    actorId: string,
    staffId: string,
    changes: {
      bio?: string;
      title?: string;
      specialties?: string[];
      credits?: string;
      photoDataUrl?: string;
    }
  ): Promise<StaffProfile> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    // A staff member edits their OWN profile; an admin may edit anyone's.
    if (!isAdmin(actor) && actor.staffId !== staffId) {
      throw new AccessDeniedError("You can only edit your own profile");
    }

    const profile = store.staff.find((s) => s.id === staffId);
    if (!profile) throw new Error("Staff profile not found");

    const pending: NonNullable<StaffProfile["pendingChanges"]> = {
      ...(profile.pendingChanges ?? {}),
    };
    if (changes.bio !== undefined) pending.bio = changes.bio;
    if (changes.title !== undefined) pending.title = changes.title;
    if (changes.specialties !== undefined) pending.specialties = changes.specialties;
    if (changes.credits !== undefined) pending.credits = changes.credits;
    if (changes.photoDataUrl) {
      pending.photoUrl = await this.store(
        "staff-photos",
        `${staffId}/photo.jpg`,
        changes.photoDataUrl
      );
    }

    profile.pendingChanges = pending;
    store.staffChangeRejections.delete(staffId);

    // Tell admins there's something to review.
    for (const admin of store.users.filter((u) => u.role === "admin" || u.role === "super_admin")) {
      if (admin.id === actor.id) continue;
      store.notifications.push({
        id: nextId("ntf"),
        userId: admin.id,
        type: "broadcast",
        title: "Staff profile update to review",
        body: `${profile.fullName} submitted changes to their profile.`,
        url: "/admin/staff-profiles",
        createdAt: nowIso(),
      });
    }

    return deepClone(profile);
  }

  async getPendingStaffChanges(actorId: string): Promise<StaffProfile[]> {
    const actor = getActor(actorId);
    if (!isAdmin(actor)) throw new AccessDeniedError("Admin only");
    return deepClone(store.staff.filter((profile) => profile.pendingChanges));
  }

  async approveStaffChanges(actorId: string, staffId: string): Promise<StaffProfile> {
    const actor = getActor(actorId);
    if (!isAdmin(actor)) throw new AccessDeniedError("Admin only");
    const profile = store.staff.find((s) => s.id === staffId);
    if (!profile) throw new Error("Staff profile not found");
    if (!profile.pendingChanges) return deepClone(profile);

    Object.assign(profile, profile.pendingChanges);
    profile.pendingChanges = undefined;
    profile.isPublished = true;

    const owner = store.users.find((u) => u.staffId === staffId);
    if (owner) {
      store.notifications.push({
        id: nextId("ntf"),
        userId: owner.id,
        type: "broadcast",
        title: "Your profile is live",
        body: "An administrator approved your profile changes.",
        url: `/staff/${staffId}`,
        createdAt: nowIso(),
      });
    }
    return deepClone(profile);
  }

  async rejectStaffChanges(
    actorId: string,
    staffId: string,
    reason: string
  ): Promise<StaffProfile> {
    const actor = getActor(actorId);
    if (!isAdmin(actor)) throw new AccessDeniedError("Admin only");
    const profile = store.staff.find((s) => s.id === staffId);
    if (!profile) throw new Error("Staff profile not found");

    profile.pendingChanges = undefined;
    store.staffChangeRejections.set(staffId, reason);

    const owner = store.users.find((u) => u.staffId === staffId);
    if (owner) {
      store.notifications.push({
        id: nextId("ntf"),
        userId: owner.id,
        type: "broadcast",
        title: "Profile changes need another look",
        body: reason,
        url: "/staff/edit",
        createdAt: nowIso(),
      });
    }
    return deepClone(profile);
  }

  /* ── email open + click tracking (#1) ─────────────────────────────── */

  async recordEmailOpen(sendId: string, recipientId: string): Promise<void> {
    // No actor: this is called from a tracking pixel with no session.
    const already = store.emailOpens.some(
      (open) => open.sendId === sendId && open.recipientId === recipientId
    );
    if (already) return;
    store.emailOpens.push({ sendId, recipientId, at: nowIso() });

    const send = store.emailSends.find((s) => s.id === sendId);
    if (send) send.stats.opened += 1;
  }

  async recordEmailClick(sendId: string, recipientId: string, url: string): Promise<void> {
    store.emailClicks.push({ sendId, recipientId, url, at: nowIso() });
    // A click implies an open, even when the pixel was blocked.
    await this.recordEmailOpen(sendId, recipientId);
  }

  async getEmailEngagement(
    actorId: string,
    sendId: string
  ): Promise<{
    opens: Array<{ recipientId: string; recipientName: string; at: string }>;
    clicks: Array<{ recipientId: string; recipientName: string; url: string; at: string }>;
    nonOpeners: User[];
  }> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const send = store.emailSends.find((s) => s.id === sendId);
    if (!send) throw new Error("Send not found");

    const nameFor = (userId: string) =>
      store.users.find((u) => u.id === userId)?.displayName ?? "Unknown";

    const opens = store.emailOpens
      .filter((open) => open.sendId === sendId)
      .map((open) => ({
        recipientId: open.recipientId,
        recipientName: nameFor(open.recipientId),
        at: open.at,
      }));

    const clicks = store.emailClicks
      .filter((click) => click.sendId === sendId)
      .map((click) => ({
        recipientId: click.recipientId,
        recipientName: nameFor(click.recipientId),
        url: click.url,
        at: click.at,
      }));

    const openedIds = new Set(opens.map((open) => open.recipientId));
    const audience = await this.resolveAudience(actorId, send.audience);
    const nonOpeners = audience.filter((user) => !openedIds.has(user.id));

    return { opens, clicks, nonOpeners };
  }

  /* ── direct messages to the office ────────────────────────────────── */

  /**
   * The demo contact tree. In production this is read live from the staff
   * portal, so nothing here is a source of truth — it exists to cover the
   * three shapes that behave differently: a health topic, a topic owned by
   * somebody who is neither an administrator nor the health director, and the
   * catch-all everyone falls back to.
   */
  private static readonly TOPICS: MessageTopic[] = [
    {
      routeId: "route-allergies",
      category: "Health & safety",
      topic: "Allergies or dietary needs",
      blurb: "Food allergies, EpiPens, anything we need to know before your child eats with us.",
      priority: "Immediate",
      sortOrder: 1,
      staffId: "staff-jo",
      recipientName: "Jo Castillo",
      recipientTitle: "Stage Manager & Director of Health and Safety",
      recipientEmail: "jo@example.org",
      recipientRole: "health_safety",
    },
    {
      routeId: "route-choreography",
      category: "Rehearsals",
      topic: "A question about choreography",
      blurb: "Dance calls, and what your child should wear to them.",
      priority: "Standard",
      sortOrder: 10,
      staffId: "staff-priya",
      recipientName: "Priya Raman",
      recipientTitle: "Choreographer & Teaching Artist",
      recipientEmail: "priya@example.org",
      // Neither an administrator nor the health director: the case that proves
      // the named person can read their own thread.
      recipientRole: "admin",
    },
    {
      routeId: "route-anything",
      category: "Families",
      topic: "Something else — I need help",
      blurb: "Not sure who to ask? Send it here and we will get it to the right person.",
      priority: "Standard",
      sortOrder: 99,
      staffId: "staff-dana",
      recipientName: "Dana Whitfield",
      recipientTitle: "Artistic Director",
      recipientEmail: "dana@example.org",
      recipientRole: "admin",
    },
  ];

  /**
   * Who may read a thread: the person it is addressed to, then administrators,
   * then the health & safety director as cover. The named person comes first
   * because they may be neither of the other two — a registration question
   * routed to the CTO would otherwise be invisible to the CTO.
   */
  private coversThread(actor: User, thread: MessageThread): boolean {
    if (thread.recipientStaffId && actor.staffId === thread.recipientStaffId) return true;
    if (isAdmin(actor)) return true; // admins cover everything
    if (thread.recipientRole !== "health_safety") return false;
    const profile = store.staff.find((s) => s.id === actor.staffId);
    return Boolean(profile?.isHealthSafetyDirector);
  }

  private threadView(thread: MessageThread): ThreadWithMessages {
    const family = store.families.find((f) => f.id === thread.familyId);
    const student = thread.studentId
      ? store.students.find((s) => s.id === thread.studentId)
      : undefined;
    return {
      thread: deepClone(thread),
      messages: deepClone(
        store.messages
          .filter((message) => message.threadId === thread.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      ),
      familyName: family?.name ?? "Unknown family",
      studentName: student ? (student.preferredName ?? student.firstName) : undefined,
    };
  }

  /**
   * The demo contact tree. In production this is read live from the staff
   * portal; here it is a handful of routes covering the shapes that matter —
   * a health topic, a topic owned by somebody who is neither an administrator
   * nor the health director, and the catch-all.
   */
  async listMessageTopics(): Promise<MessageTopic[]> {
    return MockDataProvider.TOPICS;
  }

  async startMessageThread(
    actorId: string,
    input: StartThreadInput
  ): Promise<MessageThread> {
    const actor = getActor(actorId);
    if (!actor.familyId) {
      throw new AccessDeniedError("Only families start message threads");
    }
    if (!input.subject.trim() || !input.body.trim()) {
      throw new Error("Add a subject and a message");
    }
    // Guard against addressing a thread to a child in someone else's family.
    if (input.studentId) {
      const student = store.students.find((s) => s.id === input.studentId);
      if (!student || student.familyId !== actor.familyId) {
        throw new AccessDeniedError("That isn't your student");
      }
    }

    // Resolved against the real list, never trusted from the form.
    const topic = input.topicId
      ? MockDataProvider.TOPICS.find((t) => t.routeId === input.topicId)
      : undefined;
    const recipientRole: MessageRecipientRole =
      topic?.recipientRole ?? input.recipientRole ?? "admin";

    const thread: MessageThread = {
      id: nextId("thr"),
      familyId: actor.familyId,
      recipientRole,
      routeId: topic?.routeId,
      routeTopic: topic?.topic,
      recipientStaffId: topic?.staffId,
      recipientName: topic?.recipientName,
      recipientTitle: topic?.recipientTitle,
      recipientEmail: topic?.recipientEmail,
      subject: input.subject.trim(),
      studentId: input.studentId,
      status: "open",
      createdAt: nowIso(),
      lastMessageAt: nowIso(),
      urgent: false,
    };
    store.threads.push(thread);

    store.messages.push({
      id: nextId("msg"),
      threadId: thread.id,
      authorUserId: actor.id,
      authorName: actor.displayName,
      authorSide: "family",
      body: input.body.trim(),
      createdAt: nowIso(),
    });

    // Notify everyone who covers this, so nothing waits on one inbox.
    for (const staff of store.users) {
      if (!isStaffish(staff)) continue;
      if (!this.coversThread(staff, thread)) continue;
      store.notifications.push({
        id: nextId("ntf"),
        userId: staff.id,
        type: "direct_message",
        title:
          recipientRole === "health_safety"
            ? "New health & safety message"
            : "New message from a family",
        body: input.subject.trim(),
        url: `/admin/messages/${thread.id}`,
        createdAt: nowIso(),
      });
    }

    return deepClone(thread);
  }

  private assertThreadAccess(actor: User, thread: MessageThread): void {
    if (actor.familyId === thread.familyId) return;
    if (isStaffish(actor) && this.coversThread(actor, thread)) return;
    throw new AccessDeniedError("Not your conversation");
  }

  async replyToThread(actorId: string, threadId: string, body: string): Promise<Message> {
    const actor = getActor(actorId);
    const thread = store.threads.find((t) => t.id === threadId);
    if (!thread) throw new Error("Thread not found");
    this.assertThreadAccess(actor, thread);
    if (!body.trim()) throw new Error("Write a message first");

    const fromStaff = isStaffish(actor);
    const message: Message = {
      id: nextId("msg"),
      threadId,
      authorUserId: actor.id,
      authorName: actor.displayName,
      authorSide: fromStaff ? "staff" : "family",
      body: body.trim(),
      createdAt: nowIso(),
    };
    store.messages.push(message);
    thread.lastMessageAt = message.createdAt;
    // A reply reopens a closed thread — the conversation clearly isn't done.
    if (thread.status === "closed") thread.status = "open";

    if (fromStaff) {
      for (const parent of store.users.filter(
        (u) => u.role === "parent" && u.familyId === thread.familyId
      )) {
        store.notifications.push({
          id: nextId("ntf"),
          userId: parent.id,
          type: "direct_message",
          title: "Reply from NOVA PA",
          body: thread.subject,
          url: `/messages/${thread.id}`,
          createdAt: nowIso(),
        });
      }
    } else {
      for (const staff of store.users) {
        if (!isStaffish(staff) || !this.coversThread(staff, thread)) continue;
        store.notifications.push({
          id: nextId("ntf"),
          userId: staff.id,
          type: "direct_message",
          title: "New reply from a family",
          body: thread.subject,
          url: `/admin/messages/${thread.id}`,
          createdAt: nowIso(),
        });
      }
    }

    return deepClone(message);
  }

  async getMyThreads(actorId: string): Promise<MessageThread[]> {
    const actor = getActor(actorId);
    if (!actor.familyId) return [];
    return deepClone(
      store.threads
        .filter((thread) => thread.familyId === actor.familyId)
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
    );
  }

  async getThread(actorId: string, threadId: string): Promise<ThreadWithMessages | null> {
    const actor = getActor(actorId);
    const thread = store.threads.find((t) => t.id === threadId);
    if (!thread) return null;
    this.assertThreadAccess(actor, thread);
    return this.threadView(thread);
  }

  async getStaffInbox(actorId: string): Promise<ThreadWithMessages[]> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    return store.threads
      .filter((thread) => this.coversThread(actor, thread))
      .sort((a, b) => {
        // Open before closed, then most recent first.
        if ((a.status === "open") !== (b.status === "open")) {
          return a.status === "open" ? -1 : 1;
        }
        return b.lastMessageAt.localeCompare(a.lastMessageAt);
      })
      .map((thread) => this.threadView(thread));
  }

  async setThreadStatus(
    actorId: string,
    threadId: string,
    status: ThreadStatus
  ): Promise<MessageThread> {
    const actor = getActor(actorId);
    const thread = store.threads.find((t) => t.id === threadId);
    if (!thread) throw new Error("Thread not found");
    if (!isStaffish(actor) || !this.coversThread(actor, thread)) {
      throw new AccessDeniedError("Staff only");
    }
    thread.status = status;
    return deepClone(thread);
  }

  async markThreadRead(actorId: string, threadId: string): Promise<void> {
    const actor = getActor(actorId);
    const thread = store.threads.find((t) => t.id === threadId);
    if (!thread) return;
    this.assertThreadAccess(actor, thread);
    const mySide = isStaffish(actor) ? "staff" : "family";
    for (const message of store.messages) {
      if (message.threadId !== threadId) continue;
      // You read the *other* side's messages.
      if (message.authorSide === mySide) continue;
      if (!message.readAt) message.readAt = nowIso();
    }
  }

  async getUnreadMessageCount(actorId: string): Promise<number> {
    const actor = getActor(actorId);
    const visible = store.threads.filter((thread) => {
      if (actor.familyId === thread.familyId) return true;
      return isStaffish(actor) && this.coversThread(actor, thread);
    });
    const mySide = isStaffish(actor) ? "staff" : "family";
    const threadIds = new Set(visible.map((thread) => thread.id));
    return store.messages.filter(
      (message) =>
        threadIds.has(message.threadId) && message.authorSide !== mySide && !message.readAt
    ).length;
  }

  /* ── auditions & casting ──────────────────────────────────────────── */

  /** Registered = enrolled in this production. The roster's source of truth. */
  private registeredStudents(productionId: string): Student[] {
    const enrolledIds = new Set(
      store.enrollments
        .filter((e) => e.productionId === productionId && e.status === "enrolled")
        .map((e) => e.studentId)
    );
    return store.students.filter((s) => enrolledIds.has(s.id));
  }

  async submitAuditionProfile(
    actorId: string,
    input: {
      studentId: string;
      productionId: string;
      preferenceTier: RoleTier;
      previousRoles: string;
      hopes: string;
      acknowledgedNoGuarantee: boolean;
    }
  ): Promise<AuditionProfile> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === input.studentId);
    if (!student) throw new Error("Student not found");

    // A parent of this child, or the student themself if they're 13+ with
    // their own login. Staff never write audition profiles.
    const isOwnParent = actor.role === "parent" && actor.familyId === student.familyId;
    const isSelf =
      actor.role === "student" &&
      actor.familyId === student.familyId &&
      student.hasLogin;
    if (!isOwnParent && !isSelf) {
      throw new AccessDeniedError("Only this student's family can submit their audition profile");
    }

    if (!input.acknowledgedNoGuarantee) {
      throw new Error(
        "Please confirm you understand that a preference doesn't guarantee a specific part"
      );
    }
    if (!this.registeredStudents(input.productionId).some((s) => s.id === student.id)) {
      throw new Error("This student isn't registered for that production");
    }

    const existing = store.auditionProfiles.find(
      (p) => p.studentId === input.studentId && p.productionId === input.productionId
    );
    if (existing) {
      existing.preferenceTier = input.preferenceTier;
      existing.previousRoles = input.previousRoles;
      existing.hopes = input.hopes;
      existing.updatedAt = nowIso();
      return deepClone(existing);
    }

    const profile: AuditionProfile = {
      id: nextId("aud"),
      studentId: input.studentId,
      productionId: input.productionId,
      preferenceTier: input.preferenceTier,
      previousRoles: input.previousRoles,
      hopes: input.hopes,
      acknowledgedNoGuaranteeAt: nowIso(),
      submittedByUserId: actor.id,
      submittedByRole: actor.role === "student" ? "student" : "parent",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.auditionProfiles.push(profile);
    return deepClone(profile);
  }

  async getAuditionProfile(
    actorId: string,
    studentId: string,
    productionId: string
  ): Promise<AuditionProfile | null> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) return null;
    assertStudentAccess(actor, student); // own family or staff
    return deepClone(
      store.auditionProfiles.find(
        (p) => p.studentId === studentId && p.productionId === productionId
      ) ?? null
    );
  }

  async getAuditionRoster(
    actorId: string,
    productionId: string
  ): Promise<
    Array<{
      student: Student;
      profile: AuditionProfile | null;
      evaluations: AuditionEvaluation[];
    }>
  > {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");

    return this.registeredStudents(productionId).map((student) => ({
      student: deepClone(student),
      profile: deepClone(
        store.auditionProfiles.find(
          (p) => p.studentId === student.id && p.productionId === productionId
        ) ?? null
      ),
      evaluations: deepClone(
        store.auditionEvaluations.filter(
          (e) => e.studentId === student.id && e.productionId === productionId
        )
      ),
    }));
  }

  async submitEvaluation(
    actorId: string,
    input: {
      studentId: string;
      productionId: string;
      discipline: Discipline;
      scores: Record<string, number>;
      notes: string;
      callbackNotes: string;
      growthNotes?: string;
    }
  ): Promise<AuditionEvaluation> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");

    // Scores must cover exactly this discipline's criteria, each 1–5.
    const criteria = RUBRIC_CRITERIA[input.discipline].map((c) => c.key);
    for (const key of criteria) {
      const value = input.scores[key];
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        throw new Error(`Score each rubric line 1–5 (missing: ${key})`);
      }
    }

    const existing = store.auditionEvaluations.find(
      (e) =>
        e.studentId === input.studentId &&
        e.productionId === input.productionId &&
        e.discipline === input.discipline
    );
    if (existing) {
      existing.scores = { ...input.scores };
      existing.notes = input.notes;
      existing.callbackNotes = input.callbackNotes;
      existing.growthNotes = input.growthNotes;
      existing.evaluatorStaffId = actor.staffId ?? actor.id;
      existing.evaluatorName = actor.displayName;
      existing.updatedAt = nowIso();
      return deepClone(existing);
    }

    const evaluation: AuditionEvaluation = {
      id: nextId("eval"),
      studentId: input.studentId,
      productionId: input.productionId,
      discipline: input.discipline,
      evaluatorStaffId: actor.staffId ?? actor.id,
      evaluatorName: actor.displayName,
      scores: { ...input.scores },
      notes: input.notes,
      callbackNotes: input.callbackNotes,
      growthNotes: input.growthNotes,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.auditionEvaluations.push(evaluation);
    return deepClone(evaluation);
  }

  async getShowRoles(productionId: string): Promise<ShowRole[]> {
    return deepClone(
      store.showRoles
        .filter((role) => role.productionId === productionId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    );
  }

  private boardFor(productionId: string): CastingBoard {
    let board = store.castingBoards.get(productionId);
    if (!board) {
      board = { productionId, status: "drafting", entries: [], understudyEntries: [] };
      store.castingBoards.set(productionId, board);
    }
    // Boards persisted before the understudy phase existed lack the array.
    board.understudyEntries ??= [];
    return board;
  }

  async getCastingBoard(
    actorId: string,
    productionId: string
  ): Promise<{
    board: CastingBoard;
    roles: ShowRole[];
    unassigned: Student[];
    studentsById: Record<string, Student>;
  }> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const board = this.boardFor(productionId);
    const registered = this.registeredStudents(productionId);
    const assignedIds = new Set(board.entries.map((entry) => entry.studentId));

    return {
      board: deepClone(board),
      roles: await this.getShowRoles(productionId),
      unassigned: deepClone(registered.filter((s) => !assignedIds.has(s.id))),
      studentsById: Object.fromEntries(registered.map((s) => [s.id, deepClone(s)])),
    };
  }

  async assignRole(
    actorId: string,
    productionId: string,
    roleId: string,
    studentId: string
  ): Promise<void> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const board = this.boardFor(productionId);
    if (board.status === "submitted") {
      throw new Error("Casting has already been submitted");
    }
    const role = store.showRoles.find(
      (r) => r.id === roleId && r.productionId === productionId
    );
    if (!role) throw new Error("Role not found");
    if (!this.registeredStudents(productionId).some((s) => s.id === studentId)) {
      throw new Error("That student isn't registered for this production");
    }

    // A student holds exactly one role: placing them moves them.
    board.entries = board.entries.filter((entry) => entry.studentId !== studentId);

    // Named roles hold one student; assigning over a full role replaces the
    // occupant (they return to Unassigned) rather than silently double-casting.
    if (role.capacity !== null) {
      const occupants = board.entries.filter((entry) => entry.roleId === roleId);
      if (occupants.length >= role.capacity) {
        board.entries = board.entries.filter((entry) => entry.roleId !== roleId);
      }
    }

    board.entries.push({ roleId, studentId });
  }

  async unassignRole(actorId: string, productionId: string, studentId: string): Promise<void> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const board = this.boardFor(productionId);
    if (board.status === "submitted") {
      throw new Error("Casting has already been submitted");
    }
    board.entries = board.entries.filter((entry) => entry.studentId !== studentId);
  }

  async submitCasting(
    actorId: string,
    productionId: string
  ): Promise<{ assignmentsCreated: number; familiesNotified: number }> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const board = this.boardFor(productionId);
    if (board.status === "submitted") {
      throw new Error("Casting has already been submitted");
    }

    // The hard rule: every registered student has a role. No one forgotten.
    const registered = this.registeredStudents(productionId);
    const assignedIds = new Set(board.entries.map((entry) => entry.studentId));
    const missing = registered.filter((s) => !assignedIds.has(s.id));
    if (missing.length > 0) {
      throw new Error(
        `Every student must have a role before submitting. Still unassigned: ${missing
          .map((s) => `${s.preferredName ?? s.firstName} ${s.lastName}`)
          .join(", ")}`
      );
    }

    const production = store.productions.find((p) => p.id === productionId);
    const rolesById = new Map(store.showRoles.map((role) => [role.id, role]));

    let assignmentsCreated = 0;
    const notifiedFamilies = new Set<string>();

    for (const entry of board.entries) {
      const role = rolesById.get(entry.roleId);
      const student = store.students.find((s) => s.id === entry.studentId);
      if (!role || !student) continue;

      // Published assignment — reuses the existing casting infrastructure,
      // so show history and profile pages pick it up automatically.
      const assignment = {
        id: nextId("cast"),
        productionId,
        studentId: student.id,
        characterName: role.name,
        castGroup: role.tier === "ensemble" ? role.name : undefined,
        isUnderstudy: false,
        rehearsalTrack: undefined,
        publishedAt: nowIso(),
      };
      store.casting.push(assignment);
      assignmentsCreated += 1;

      store.showHistory.push({
        id: nextId("sh"),
        studentId: student.id,
        productionTitle: production?.title ?? "Production",
        role: role.name,
        seasonName: store.seasons.find((s) => s.isCurrent)?.name ?? "",
        director: undefined,
        venue: production?.venue,
        organization: undefined,
        fromCasting: true,
        year: production?.opensOn?.slice(0, 4) ?? "",
      });

      // The confirmation record the family responds to. lastRemindedAt
      // starts now so the first 12-hour reminder counts from submission.
      store.castingConfirmations.push({
        id: nextId("conf"),
        assignmentId: assignment.id,
        studentId: student.id,
        familyId: student.familyId,
        lastRemindedAt: nowIso(),
        reminderCount: 0,
      });

      // Notify THIS family about THIS child only. The notification itself
      // carries the role, so no cast list ever crosses family lines.
      for (const parent of store.users.filter(
        (u) => u.role === "parent" && u.familyId === student.familyId
      )) {
        if (!this.prefAllows(parent.id, "casting_released")) continue;
        store.notifications.push({
          id: nextId("ntf"),
          userId: parent.id,
          type: "casting_released",
          title: `Casting for ${production?.title ?? "the show"} 🎉`,
          body: `${student.preferredName ?? student.firstName} will be: ${role.name}. Tap to confirm the name for the playbill.`,
          url: "/casting",
          createdAt: nowIso(),
        });
        notifiedFamilies.add(student.familyId);
      }
    }

    board.status = "submitted";
    board.submittedAt = nowIso();
    board.submittedByName = actor.displayName;

    return { assignmentsCreated, familiesNotified: notifiedFamilies.size };
  }

  /* ── understudies: leads only, after the main board is locked ─────── */

  async assignUnderstudy(
    actorId: string,
    productionId: string,
    roleId: string,
    studentId: string
  ): Promise<void> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const board = this.boardFor(productionId);
    if (board.status !== "submitted") {
      throw new Error("Cast the show first — understudies come after every role is filled");
    }
    if (board.understudiesPublishedAt) {
      throw new Error("Understudies have already been published");
    }

    const role = store.showRoles.find(
      (candidate) => candidate.id === roleId && candidate.productionId === productionId
    );
    if (!role) throw new Error("Role not found");
    if (role.tier !== "lead") {
      throw new Error("Understudies are cast for lead roles only");
    }
    if (!this.registeredStudents(productionId).some((s) => s.id === studentId)) {
      throw new Error("That student isn't registered for this production");
    }
    // A student can't understudy the role they already hold — that's not
    // coverage. Any OTHER role they hold is fine; duplication is the point.
    const holdsThisRole = board.entries.some(
      (entry) => entry.roleId === roleId && entry.studentId === studentId
    );
    if (holdsThisRole) {
      throw new Error("They already play this role — pick a different understudy");
    }

    // One understudy per lead, one lead per understudy: placing moves.
    board.understudyEntries = board.understudyEntries.filter(
      (entry) => entry.studentId !== studentId && entry.roleId !== roleId
    );
    board.understudyEntries.push({ roleId, studentId });
  }

  async unassignUnderstudy(
    actorId: string,
    productionId: string,
    studentId: string
  ): Promise<void> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const board = this.boardFor(productionId);
    if (board.understudiesPublishedAt) {
      throw new Error("Understudies have already been published");
    }
    board.understudyEntries = board.understudyEntries.filter(
      (entry) => entry.studentId !== studentId
    );
  }

  /** Lead roles with no understudy yet — "where the holes are". */
  async getUnderstudyHoles(actorId: string, productionId: string): Promise<ShowRole[]> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const board = this.boardFor(productionId);
    const covered = new Set(board.understudyEntries.map((entry) => entry.roleId));
    return deepClone(
      store.showRoles
        .filter(
          (role) =>
            role.productionId === productionId &&
            role.tier === "lead" &&
            !covered.has(role.id)
        )
        .sort((a, b) => a.sortOrder - b.sortOrder)
    );
  }

  /**
   * Publish understudies: assignments + family notifications, exactly like
   * the main cast — each family learns their child's understudy track only.
   * Holes are allowed; they stay visible on the board and cast list.
   */
  async publishUnderstudies(
    actorId: string,
    productionId: string
  ): Promise<{ published: number; holes: number }> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const board = this.boardFor(productionId);
    if (board.status !== "submitted") {
      throw new Error("Cast the show first");
    }
    if (board.understudiesPublishedAt) {
      throw new Error("Understudies have already been published");
    }

    const production = store.productions.find((p) => p.id === productionId);
    const rolesById = new Map(store.showRoles.map((role) => [role.id, role]));
    let published = 0;

    for (const entry of board.understudyEntries) {
      const role = rolesById.get(entry.roleId);
      const student = store.students.find((s) => s.id === entry.studentId);
      if (!role || !student) continue;

      const assignment = {
        id: nextId("cast"),
        productionId,
        studentId: student.id,
        characterName: `${role.name} (Understudy)`,
        castGroup: undefined,
        isUnderstudy: true,
        rehearsalTrack: undefined,
        publishedAt: nowIso(),
      };
      store.casting.push(assignment);
      published += 1;

      store.showHistory.push({
        id: nextId("sh"),
        studentId: student.id,
        productionTitle: production?.title ?? "Production",
        role: `${role.name} (Understudy)`,
        seasonName: store.seasons.find((s) => s.isCurrent)?.name ?? "",
        director: undefined,
        venue: production?.venue,
        organization: undefined,
        fromCasting: true,
        year: production?.opensOn?.slice(0, 4) ?? "",
      });

      store.castingConfirmations.push({
        id: nextId("conf"),
        assignmentId: assignment.id,
        studentId: student.id,
        familyId: student.familyId,
        lastRemindedAt: nowIso(),
        reminderCount: 0,
      });

      for (const parent of store.users.filter(
        (u) => u.role === "parent" && u.familyId === student.familyId
      )) {
        if (!this.prefAllows(parent.id, "casting_released")) continue;
        store.notifications.push({
          id: nextId("ntf"),
          userId: parent.id,
          type: "casting_released",
          title: `Understudy casting for ${production?.title ?? "the show"} ⭐`,
          body: `${student.preferredName ?? student.firstName} will understudy: ${role.name}. Tap to confirm the name for the playbill.`,
          url: "/casting",
          createdAt: nowIso(),
        });
      }
    }

    board.understudiesPublishedAt = nowIso();
    const holes = (await this.getUnderstudyHoles(actorId, productionId)).length;
    return { published, holes };
  }

  async getMyCastingConfirmations(actorId: string): Promise<
    Array<{
      confirmation: CastingConfirmation;
      roleName: string;
      productionTitle: string;
      studentName: string;
    }>
  > {
    const actor = getActor(actorId);
    if (!actor.familyId) return [];

    return store.castingConfirmations
      .filter((confirmation) => confirmation.familyId === actor.familyId)
      .map((confirmation) => {
        const assignment = store.casting.find((c) => c.id === confirmation.assignmentId);
        const production = store.productions.find(
          (p) => p.id === assignment?.productionId
        );
        const student = store.students.find((s) => s.id === confirmation.studentId);
        return {
          confirmation: deepClone(confirmation),
          roleName: assignment?.characterName ?? "",
          productionTitle: production?.title ?? "",
          studentName: student
            ? `${student.preferredName ?? student.firstName} ${student.lastName}`
            : "",
        };
      });
  }

  private confirmationForFamily(actorId: string, confirmationId: string): CastingConfirmation {
    const actor = getActor(actorId);
    const confirmation = store.castingConfirmations.find((c) => c.id === confirmationId);
    if (!confirmation) throw new Error("Confirmation not found");
    if (actor.familyId !== confirmation.familyId && !isAdmin(actor)) {
      throw new AccessDeniedError("Not your child's casting");
    }
    return confirmation;
  }

  async respondToCasting(
    actorId: string,
    confirmationId: string,
    response: { nameCorrect: boolean; playbillName?: string }
  ): Promise<CastingConfirmation> {
    const confirmation = this.confirmationForFamily(actorId, confirmationId);
    confirmation.nameCorrect = response.nameCorrect;
    confirmation.respondedAt = nowIso();
    if (!response.nameCorrect) {
      const corrected = response.playbillName?.trim();
      if (!corrected) {
        throw new Error("Tell us exactly what the playbill should print");
      }
      confirmation.playbillName = corrected;

      // Tell staff a playbill correction arrived.
      const student = store.students.find((s) => s.id === confirmation.studentId);
      for (const staff of store.users.filter((u) => isStaffish(u))) {
        if (!isAdmin(staff)) continue;
        store.notifications.push({
          id: nextId("ntf"),
          userId: staff.id,
          type: "broadcast",
          title: "Playbill name correction",
          body: `${student?.firstName ?? "A student"} → "${corrected}"`,
          url: "/admin/casting-responses",
          createdAt: nowIso(),
        });
      }
    } else {
      confirmation.playbillName = undefined;
    }
    return deepClone(confirmation);
  }

  async requestAuditionFeedback(
    actorId: string,
    confirmationId: string
  ): Promise<AuditionEvaluation[]> {
    const confirmation = this.confirmationForFamily(actorId, confirmationId);
    if (!confirmation.feedbackRequestedAt) {
      confirmation.feedbackRequestedAt = nowIso();
    }
    const assignment = store.casting.find((c) => c.id === confirmation.assignmentId);
    if (!assignment) return [];

    // Release the rubrics and evaluator notes for THIS child only.
    // callbackNotes stay staff-internal: strip them from the release.
    return store.auditionEvaluations
      .filter(
        (evaluation) =>
          evaluation.studentId === confirmation.studentId &&
          evaluation.productionId === assignment.productionId
      )
      .map((evaluation) => ({ ...deepClone(evaluation), callbackNotes: "" }));
  }

  async getGrowthRecommendations(
    actorId: string,
    studentId: string,
    productionId: string
  ): Promise<GrowthRecommendation[]> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) return [];
    assertStudentAccess(actor, student);

    // Which catalog products / registration classes address each discipline.
    // The class link is the theoretical registration-system bridge for now.
    const OFFERINGS: Record<Discipline, { productIds: string[]; classIds: string[] }> = {
      vocal: { productIds: ["prod-voice-lessons"], classIds: ["class-voice1"] },
      dance: { productIds: ["prod-dance-lessons"], classIds: ["class-mtd2"] },
      acting: { productIds: ["prod-acting-lessons"], classIds: [] },
    };
    const LABEL: Record<Discipline, string> = {
      vocal: "singing",
      dance: "dance",
      acting: "acting",
    };

    const recommendations: GrowthRecommendation[] = [];
    for (const evaluation of store.auditionEvaluations.filter(
      (e) => e.studentId === studentId && e.productionId === productionId
    )) {
      const values = Object.values(evaluation.scores);
      if (values.length === 0) continue;
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      if (average >= RECOMMENDATION_THRESHOLD) continue;

      recommendations.push({
        discipline: evaluation.discipline,
        averageScore: Math.round(average * 10) / 10,
        ...OFFERINGS[evaluation.discipline],
        message: `Growing ${LABEL[evaluation.discipline]} skills between shows makes the biggest difference at the next audition.`,
      });
    }
    return recommendations;
  }

  async remindPendingCastingConfirmations(
    actorId: string,
    options?: { olderThanMs?: number }
  ): Promise<{ reminded: number }> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const olderThanMs = options?.olderThanMs ?? CONFIRMATION_REMINDER_MS;
    // olderThanMs <= 0 means "everything unanswered is due" (test override).
    // The generated timestamps come from a monotonic clock that can sit a
    // few ms ahead of wall clock, so a "now minus zero" cutoff would race it.
    const cutoff = olderThanMs <= 0 ? Number.POSITIVE_INFINITY : Date.now() - olderThanMs;

    let reminded = 0;
    for (const confirmation of store.castingConfirmations) {
      if (confirmation.nameCorrect !== undefined) continue; // answered
      const last = confirmation.lastRemindedAt
        ? new Date(confirmation.lastRemindedAt).getTime()
        : 0;
      if (last > cutoff) continue; // reminded recently

      const student = store.students.find((s) => s.id === confirmation.studentId);
      const assignment = store.casting.find((c) => c.id === confirmation.assignmentId);
      if (!student || !assignment) continue;

      for (const parent of store.users.filter(
        (u) => u.role === "parent" && u.familyId === confirmation.familyId
      )) {
        store.notifications.push({
          id: nextId("ntf"),
          userId: parent.id,
          type: "casting_released",
          title: "Reminder: confirm the playbill name",
          body: `${student.preferredName ?? student.firstName}'s role (${assignment.characterName}) is waiting on your confirmation.`,
          url: "/casting",
          createdAt: nowIso(),
        });
      }
      confirmation.lastRemindedAt = nowIso();
      confirmation.reminderCount = (confirmation.reminderCount ?? 0) + 1;
      reminded += 1;
    }
    return { reminded };
  }

  async getCastListStatus(
    actorId: string,
    productionId: string
  ): Promise<
    Array<{
      role: ShowRole;
      status: "open" | "filled" | "accepted";
      holders: Array<{
        studentName: string;
        playbillName: string;
        responded: boolean;
        isUnderstudy: boolean;
      }>;
    }>
  > {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const roles = await this.getShowRoles(productionId);
    const assignments = store.casting.filter(
      (assignment) => assignment.productionId === productionId && assignment.publishedAt
    );

    return roles.map((role) => {
      const holders = assignments
        .filter((assignment) =>
          assignment.isUnderstudy
            ? assignment.characterName === `${role.name} (Understudy)` ||
              assignment.characterName === role.name
            : assignment.characterName === role.name
        )
        .map((assignment) => {
          const student = store.students.find((s) => s.id === assignment.studentId);
          const confirmation = store.castingConfirmations.find(
            (candidate) => candidate.assignmentId === assignment.id
          );
          const studentName = student
            ? `${student.preferredName ?? student.firstName} ${student.lastName}`
            : "Unknown";
          return {
            studentName,
            playbillName: confirmation?.playbillName ?? studentName,
            responded: confirmation?.nameCorrect !== undefined,
            isUnderstudy: assignment.isUnderstudy,
          };
        });

      // Understudies don't gate acceptance of the principal role.
      const principals = holders.filter((holder) => !holder.isUnderstudy);
      const status: "open" | "filled" | "accepted" =
        principals.length === 0
          ? "open"
          : principals.every((holder) => holder.responded)
            ? "accepted"
            : "filled";

      return { role, status, holders };
    });
  }

  /* ── script & curriculum: scenes/songs mapped to roles ──────────────── */

  /** Published role ids a student holds in a production (principal + u/s). */
  private publishedRoleIdsForStudent(
    productionId: string,
    studentId: string
  ): { principal: string[]; understudy: string[] } {
    const roles = store.showRoles.filter((r) => r.productionId === productionId);
    const principal: string[] = [];
    const understudy: string[] = [];
    for (const assignment of store.casting) {
      if (
        assignment.productionId !== productionId ||
        assignment.studentId !== studentId ||
        !assignment.publishedAt
      )
        continue;
      for (const role of roles) {
        if (assignment.characterName === role.name) principal.push(role.id);
        else if (
          assignment.isUnderstudy &&
          assignment.characterName === `${role.name} (Understudy)`
        )
          understudy.push(role.id);
      }
    }
    return { principal, understudy };
  }

  async getShowScenes(productionId: string): Promise<ShowScene[]> {
    return deepClone(
      store.showScenes
        .filter((scene) => scene.productionId === productionId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    );
  }

  /**
   * Exactly which scenes/songs a child is in, and as whom. Understudies see
   * every scene of the role they cover, marked as such. Family-scoped:
   * parents only ever see their own child's breakdown.
   */
  async getStudentSceneBreakdown(
    actorId: string,
    studentId: string,
    productionId: string
  ): Promise<Array<{ scene: ShowScene; roleName: string; isUnderstudy: boolean }>> {
    const actor = getActor(actorId);
    const student = store.students.find((s) => s.id === studentId);
    if (!student) throw new Error("Student not found");
    if (!isStaffish(actor)) assertFamilyAccess(actor, student.familyId);

    const { principal, understudy } = this.publishedRoleIdsForStudent(productionId, studentId);
    if (principal.length === 0 && understudy.length === 0) return [];
    const roleName = (id: string) => store.showRoles.find((r) => r.id === id)?.name ?? "";

    const rows: Array<{ scene: ShowScene; roleName: string; isUnderstudy: boolean }> = [];
    for (const scene of store.showScenes
      .filter((s) => s.productionId === productionId)
      .sort((a, b) => a.sortOrder - b.sortOrder)) {
      const asPrincipal = principal.find((id) => scene.roleIds.includes(id));
      if (asPrincipal) {
        rows.push({ scene: deepClone(scene), roleName: roleName(asPrincipal), isUnderstudy: false });
        continue;
      }
      const asUnderstudy = understudy.find((id) => scene.roleIds.includes(id));
      if (asUnderstudy) {
        rows.push({
          scene: deepClone(scene),
          roleName: `${roleName(asUnderstudy)} (Understudy)`,
          isUnderstudy: true,
        });
      }
    }
    return rows;
  }

  /**
   * Rehearsal notices, run hourly by the cron job:
   *  - "reminder": event starts within the next 24 hours → notify each
   *    involved family (per-child calendar rules — scene-tagged rehearsals
   *    only notify families whose child is actually called).
   *  - "thanks": event ended within the last 24 hours → thank-you note.
   * Deduped per event+family+kind so re-runs never double-send.
   */
  async runRehearsalNotices(
    actorId: string,
    options?: { now?: string }
  ): Promise<{ reminders: number; thanks: number }> {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const now = options?.now ? new Date(options.now).getTime() : Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    let reminders = 0;
    let thanks = 0;
    for (const event of store.events) {
      if (event.type !== "rehearsal" && event.type !== "tech" && event.type !== "performance")
        continue;
      const startsAt = new Date(event.startsAt).getTime();
      const endsAt = new Date(event.endsAt).getTime();
      const dueReminder = startsAt > now && startsAt <= now + DAY;
      const dueThanks = endsAt <= now && endsAt > now - DAY;
      if (!dueReminder && !dueThanks) continue;

      // Which families have a child called for this event?
      const familyIds = new Set<string>();
      const namesByFamily = new Map<string, string[]>();
      for (const student of store.students) {
        if (!this.eventsForStudent(student.id).some((e) => e.id === event.id)) continue;
        familyIds.add(student.familyId);
        const names = namesByFamily.get(student.familyId) ?? [];
        names.push(student.preferredName ?? student.firstName);
        namesByFamily.set(student.familyId, names);
      }

      for (const familyId of familyIds) {
        const kind = dueReminder ? "reminder" : "thanks";
        const already = store.eventNotices.some(
          (n) => n.eventId === event.id && n.familyId === familyId && n.kind === kind
        );
        if (already) continue;

        const names = (namesByFamily.get(familyId) ?? []).join(" & ");
        const when = new Date(event.startsAt).toLocaleString("en-US", {
          weekday: "long",
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
        });
        for (const parent of store.users.filter(
          (u) => u.role === "parent" && u.familyId === familyId
        )) {
          store.notifications.push({
            id: nextId("ntf"),
            userId: parent.id,
            type: "schedule_change",
            title:
              kind === "reminder"
                ? `Tomorrow: ${event.title}`
                : `Thank you for a great rehearsal!`,
            body:
              kind === "reminder"
                ? `${names} ${names.includes("&") ? "are" : "is"} called ${when} at ${event.location}.${event.whatToBring ? ` Bring: ${event.whatToBring}.` : ""}`
                : `${names} did wonderful work at ${event.title}. See the calendar for what's next.`,
            url: "/calendar",
            createdAt: nowIso(),
          });
        }
        store.eventNotices.push({ eventId: event.id, familyId, kind, at: nowIso() });
        if (kind === "reminder") reminders += 1;
        else thanks += 1;
      }
    }

    // Private lessons ride the same job: 24h-before reminder per booking,
    // deduped through the same eventNotices ledger.
    for (const booking of store.lessonBookings) {
      if (booking.status !== "active") continue;
      const slot = store.lessonSlots.find((s) => s.id === booking.slotId);
      if (!slot) continue;
      const startMs = nextLessonOccurrence(slot, now);
      if (!(startMs > now && startMs <= now + DAY)) continue;

      const eventId = `lesson-${booking.id}-${new Date(startMs).toISOString().slice(0, 10)}`;
      const already = store.eventNotices.some(
        (n) => n.eventId === eventId && n.familyId === booking.familyId && n.kind === "reminder"
      );
      if (already) continue;

      const student = store.students.find((s) => s.id === booking.studentId);
      const teacher = store.staff.find((s) => s.id === slot.teacherStaffId);
      const label =
        LESSON_DISCIPLINES.find((d) => d.value === slot.discipline)?.label ?? "Private";
      const when = new Date(startMs).toLocaleString("en-US", {
        weekday: "long",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      });
      for (const parent of store.users.filter(
        (u) => u.role === "parent" && u.familyId === booking.familyId
      )) {
        store.notifications.push({
          id: nextId("ntf"),
          userId: parent.id,
          type: "schedule_change",
          title: `Tomorrow: ${label} lesson`,
          body: `${student?.preferredName ?? student?.firstName ?? "Your student"}'s ${label.toLowerCase()} lesson with ${teacher?.fullName ?? "NOVA PA"} is ${when} at ${slot.location}.`,
          url: "/store/lessons",
          createdAt: nowIso(),
        });
      }
      store.eventNotices.push({
        eventId,
        familyId: booking.familyId,
        kind: "reminder",
        at: nowIso(),
      });
      reminders += 1;
    }
    return { reminders, thanks };
  }

  /* ── private lessons: weekly recurring slots (#lessons) ─────────────── */

  async getLessonSlots(actorId: string): Promise<
    Array<{
      slot: LessonSlot;
      teacherName: string;
      teacherTitle: string;
      status: "open" | "taken" | "yours";
      bookingId?: string;
      studentName?: string;
    }>
  > {
    const actor = getActor(actorId);
    const staffView = isStaffish(actor);

    return store.lessonSlots
      .map((slot) => {
        const teacher = store.staff.find((s) => s.id === slot.teacherStaffId);
        const booking = store.lessonBookings.find(
          (b) => b.slotId === slot.id && b.status === "active"
        );
        const mine = booking && actor.familyId === booking.familyId;
        const student = booking
          ? store.students.find((s) => s.id === booking.studentId)
          : undefined;
        return {
          slot: deepClone(slot),
          teacherName: teacher?.fullName ?? "NOVA PA",
          teacherTitle: teacher?.title ?? "",
          status: (booking ? (mine ? "yours" : "taken") : "open") as
            | "open"
            | "taken"
            | "yours",
          // Who holds a slot is private: families see "taken", never a name.
          bookingId: mine || staffView ? booking?.id : undefined,
          studentName:
            (mine || staffView) && student
              ? `${student.preferredName ?? student.firstName} ${student.lastName}`
              : undefined,
        };
      })
      .sort(
        (a, b) =>
          a.teacherName.localeCompare(b.teacherName) ||
          a.slot.weekday - b.slot.weekday ||
          a.slot.startTime.localeCompare(b.slot.startTime)
      );
  }

  async bookLessonSlot(
    actorId: string,
    input: { slotId: string; studentId: string; goals?: string }
  ): Promise<LessonBooking> {
    const actor = getActor(actorId);
    const slot = store.lessonSlots.find((s) => s.id === input.slotId);
    if (!slot) throw new Error("That lesson time no longer exists");
    const student = store.students.find((s) => s.id === input.studentId);
    if (!student) throw new Error("Student not found");
    if (!isStaffish(actor)) assertFamilyAccess(actor, student.familyId);

    if (store.lessonBookings.some((b) => b.slotId === slot.id && b.status === "active")) {
      throw new Error("That time was just taken — pick another open slot");
    }

    const startMs = nextLessonOccurrence(slot, Date.now());
    const booking: LessonBooking = {
      id: nextId("lb"),
      slotId: slot.id,
      studentId: student.id,
      familyId: student.familyId,
      startDate: new Date(startMs).toISOString().slice(0, 10),
      status: "active",
      goals: input.goals?.trim() || undefined,
      paymentMethod: "studio_invoice",
      createdAt: nowIso(),
    };
    store.lessonBookings.push(booking);

    const teacher = store.staff.find((s) => s.id === slot.teacherStaffId);
    const label =
      LESSON_DISCIPLINES.find((d) => d.value === slot.discipline)?.label ?? "Private";
    const studentName = student.preferredName ?? student.firstName;

    for (const parent of store.users.filter(
      (u) => u.role === "parent" && u.familyId === student.familyId
    )) {
      store.notifications.push({
        id: nextId("ntf"),
        userId: parent.id,
        type: "schedule_change",
        title: `Weekly ${label.toLowerCase()} lesson booked 🎉`,
        body: `${studentName} has a standing ${label.toLowerCase()} lesson with ${teacher?.fullName ?? "NOVA PA"}, starting ${booking.startDate}. It's on your family calendar.`,
        url: "/store/lessons",
        createdAt: nowIso(),
      });
    }
    if (teacher?.userId) {
      store.notifications.push({
        id: nextId("ntf"),
        userId: teacher.userId,
        type: "schedule_change",
        title: "New weekly lesson student",
        body: `${studentName} ${student.lastName} booked your ${label.toLowerCase()} slot, starting ${booking.startDate}.`,
        url: "/admin/lessons",
        createdAt: nowIso(),
      });
    }
    return deepClone(booking);
  }

  async cancelLessonBooking(actorId: string, bookingId: string): Promise<void> {
    const actor = getActor(actorId);
    const booking = store.lessonBookings.find((b) => b.id === bookingId);
    if (!booking || booking.status !== "active") throw new Error("Booking not found");
    if (!isStaffish(actor)) assertFamilyAccess(actor, booking.familyId);

    booking.status = "cancelled";
    booking.cancelledAt = nowIso();

    const slot = store.lessonSlots.find((s) => s.id === booking.slotId);
    const teacher = slot
      ? store.staff.find((s) => s.id === slot.teacherStaffId)
      : undefined;
    const student = store.students.find((s) => s.id === booking.studentId);
    if (teacher?.userId) {
      store.notifications.push({
        id: nextId("ntf"),
        userId: teacher.userId,
        type: "schedule_change",
        title: "Weekly lesson cancelled",
        body: `${student?.preferredName ?? student?.firstName ?? "A student"}'s weekly slot (${slot ? `${slot.startTime} lessons` : "lesson"}) is open again.`,
        url: "/admin/lessons",
        createdAt: nowIso(),
      });
    }
  }

  async getMyLessonBookings(actorId: string): Promise<
    Array<{
      booking: LessonBooking;
      slot: LessonSlot;
      teacherName: string;
      studentName: string;
      nextLessonAt: string;
    }>
  > {
    const actor = getActor(actorId);
    if (!actor.familyId) return [];

    return store.lessonBookings
      .filter((b) => b.familyId === actor.familyId && b.status === "active")
      .flatMap((booking) => {
        const slot = store.lessonSlots.find((s) => s.id === booking.slotId);
        if (!slot) return [];
        const teacher = store.staff.find((s) => s.id === slot.teacherStaffId);
        const student = store.students.find((s) => s.id === booking.studentId);
        return [
          {
            booking: deepClone(booking),
            slot: deepClone(slot),
            teacherName: teacher?.fullName ?? "NOVA PA",
            studentName: student
              ? `${student.preferredName ?? student.firstName} ${student.lastName}`
              : "Student",
            nextLessonAt: new Date(
              nextLessonOccurrence(slot, Date.now())
            ).toISOString(),
          },
        ];
      });
  }

  /** Staff: every slot with who's in it — the teaching week at a glance. */
  async getLessonRoster(actorId: string): Promise<
    Array<{
      slot: LessonSlot;
      teacherName: string;
      studentName?: string;
      familyName?: string;
      goals?: string;
      startDate?: string;
    }>
  > {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");

    return store.lessonSlots
      .map((slot) => {
        const teacher = store.staff.find((s) => s.id === slot.teacherStaffId);
        const booking = store.lessonBookings.find(
          (b) => b.slotId === slot.id && b.status === "active"
        );
        const student = booking
          ? store.students.find((s) => s.id === booking.studentId)
          : undefined;
        const family = booking
          ? store.families.find((f) => f.id === booking.familyId)
          : undefined;
        return {
          slot: deepClone(slot),
          teacherName: teacher?.fullName ?? "NOVA PA",
          studentName: student
            ? `${student.preferredName ?? student.firstName} ${student.lastName}`
            : undefined,
          familyName: family?.name,
          goals: booking?.goals,
          startDate: booking?.startDate,
        };
      })
      .sort(
        (a, b) =>
          a.teacherName.localeCompare(b.teacherName) ||
          a.slot.weekday - b.slot.weekday ||
          a.slot.startTime.localeCompare(b.slot.startTime)
      );
  }

  async getCastingResponses(
    actorId: string,
    productionId: string
  ): Promise<
    Array<{ confirmation: CastingConfirmation; studentName: string; roleName: string }>
  > {
    const actor = getActor(actorId);
    if (!isStaffish(actor)) throw new AccessDeniedError("Staff only");

    return store.castingConfirmations
      .filter((confirmation) => {
        const assignment = store.casting.find((c) => c.id === confirmation.assignmentId);
        return assignment?.productionId === productionId;
      })
      .map((confirmation) => {
        const assignment = store.casting.find((c) => c.id === confirmation.assignmentId);
        const student = store.students.find((s) => s.id === confirmation.studentId);
        return {
          confirmation: deepClone(confirmation),
          studentName: student
            ? `${student.preferredName ?? student.firstName} ${student.lastName}`
            : "",
          roleName: assignment?.characterName ?? "",
        };
      });
  }

  /* ── store catalog ────────────────────────────────────────────────── */

  async getProducts(productionId?: string): Promise<Product[]> {
    return deepClone(
      store.products
        .filter((product) => product.isActive)
        .filter(
          (product) =>
            !productionId || !product.productionId || product.productionId === productionId
        )
        .sort((a, b) => a.sortOrder - b.sortOrder)
    );
  }

  async addCatalogItemToCart(
    actorId: string,
    input: {
      productId: string;
      optionValue?: string;
      quantity: number;
      customization: Customization;
    }
  ): Promise<CartItem[]> {
    const actor = getActor(actorId);
    if (actor.role !== "parent" && !isStaffish(actor)) {
      throw new AccessDeniedError("Only families can order");
    }
    if (input.quantity < 1) throw new Error("Quantity must be at least 1");

    const product = store.products.find((p) => p.id === input.productId);
    if (!product || !product.isActive) throw new Error("Product not available");

    // Reject an option that doesn't belong to this product — otherwise a
    // crafted request could claim a cheaper tier's price.
    if (product.options.length > 0) {
      const valid = product.options.some((option) => option.value === input.optionValue);
      if (!valid) throw new Error("Choose an option");
    }

    // Price is computed here from the catalog, never taken from the client.
    const unitPriceCents = priceFor(product, input.optionValue);
    const optionLabel = product.options.find(
      (option) => option.value === input.optionValue
    )?.label;

    const cart = this.cartFor(actorId);
    cart.push({
      id: nextId("cart"),
      quantity: input.quantity,
      unitPriceCents,
      productType: product.type,
      productId: product.id,
      optionValue: input.optionValue,
      displayName: optionLabel ? `${product.name} — ${optionLabel}` : product.name,
      customization: deepClone(input.customization),
    });
    return deepClone(cart);
  }

  async reorder(actorId: string, orderId: string): Promise<CartItem[]> {
    const actor = getActor(actorId);
    const order = store.orders.find((o) => o.id === orderId);
    if (!order) throw new Error("Order not found");
    assertFamilyAccess(actor, order.familyId);
    const cart = this.cartFor(actorId);
    for (const item of order.items) {
      cart.push({ ...deepClone(item), id: nextId("cart") });
    }
    return deepClone(cart);
  }
}
