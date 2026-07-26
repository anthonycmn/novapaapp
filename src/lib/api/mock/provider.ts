import { AccessDeniedError, type DataProvider } from "../provider";
import type {
  AppNotification,
  CastingAssignment,
  ClassOffering,
  EmailSend,
  EmailTemplate,
  Enrollment,
  Family,
  FeedAudience,
  FeedCategory,
  FeedPost,
  Guardian,
  HopesEntry,
  NotificationPrefs,
  NotificationType,
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
}
