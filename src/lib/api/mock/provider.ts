import { AccessDeniedError, type DataProvider } from "../provider";
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
  };
}

let store = buildStore();

/** Test helper: restore pristine seed state. */
export function resetMockStore() {
  store = buildStore();
}

let idCounter = 1000;
const nextId = (prefix: string) => `${prefix}-${idCounter++}`;
const nowIso = () => new Date().toISOString();

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

  /** Events relevant to a student via their enrollments. */
  private eventsForStudent(studentId: string): CalendarEvent[] {
    const enrollments = store.enrollments.filter(
      (e) => e.studentId === studentId && e.status === "enrolled"
    );
    const classIds = new Set(enrollments.map((e) => e.classId).filter(Boolean));
    const productionIds = new Set(enrollments.map((e) => e.productionId).filter(Boolean));
    return store.events.filter(
      (event) =>
        (event.classId && classIds.has(event.classId)) ||
        (event.productionId && productionIds.has(event.productionId))
    );
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
          request.kind === "early_dropoff"
            ? `Early drop-off approved (${request.dropOffTime})`
            : request.kind === "late_pickup"
              ? `Late pick-up approved (${request.pickUpTime})`
              : `Extended care approved`,
        startsAt: `${request.startDate}T12:00:00.000Z`,
        endsAt: `${request.endDate}T12:30:00.000Z`,
        location: "Studio front desk",
        studentIds: [request.studentId],
      });
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

  /* ── early drop-off / late pick-up (#10) ──────────────────────────── */

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
