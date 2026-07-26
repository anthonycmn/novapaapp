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
} from "./types";

/**
 * Every data access in the app goes through this interface — components
 * never talk to Supabase (or the mock store) directly.
 *
 * All methods take the acting user's id as `actorId`; adapters are
 * responsible for enforcing access rules (the Supabase adapter relies on
 * RLS, the mock adapter re-implements the same rules so authorization is
 * testable without Postgres).
 */
export interface DataProvider {
  /* auth/session */
  getUserById(userId: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;

  /* families */
  getFamily(actorId: string, familyId: string): Promise<Family | null>;
  updateFamily(actorId: string, familyId: string, patch: Partial<Family>): Promise<Family>;
  getGuardians(actorId: string, familyId: string): Promise<Guardian[]>;
  inviteGuardian(
    actorId: string,
    familyId: string,
    invite: { fullName: string; email: string; relationship: string }
  ): Promise<Guardian>;

  /* students */
  getStudentsForFamily(actorId: string, familyId: string): Promise<Student[]>;
  getStudent(actorId: string, studentId: string): Promise<Student | null>;
  updateStudent(actorId: string, studentId: string, patch: Partial<Student>): Promise<Student>;
  getHopes(actorId: string, studentId: string): Promise<HopesEntry[]>;
  upsertHopes(
    actorId: string,
    studentId: string,
    entry: { seasonId: string; author: "parent" | "student"; text: string; visibleToStudent?: boolean }
  ): Promise<HopesEntry>;
  getShowHistory(actorId: string, studentId: string): Promise<ShowHistoryEntry[]>;
  addShowHistoryEntry(
    actorId: string,
    studentId: string,
    entry: Omit<ShowHistoryEntry, "id" | "studentId" | "fromCasting">
  ): Promise<ShowHistoryEntry>;

  /* catalog */
  getCurrentSeason(): Promise<Season>;
  getPrograms(seasonId?: string): Promise<Program[]>;
  getClasses(programId?: string): Promise<ClassOffering[]>;
  getProductions(seasonId?: string): Promise<Production[]>;
  getProduction(productionId: string): Promise<Production | null>;

  /* enrollments & casting */
  getEnrollmentsForStudent(actorId: string, studentId: string): Promise<Enrollment[]>;
  getEnrollmentsForFamily(actorId: string, familyId: string): Promise<Enrollment[]>;
  getCastingForStudent(actorId: string, studentId: string): Promise<CastingAssignment[]>;

  /* staff */
  getStaffProfiles(): Promise<StaffProfile[]>;
  getStaffProfile(staffId: string): Promise<StaffProfile | null>;

  /* staff-only: pre-casting review (#4) — students enrolled in a
   * production with their hopes entries and audition materials. */
  getCastingReview(
    actorId: string,
    productionId: string
  ): Promise<Array<{ student: Student; hopes: HopesEntry[] }>>;

  /* feed (#7) — one-way: only staff post; families react + ask questions */
  getFeedForUser(actorId: string): Promise<FeedPost[]>;
  createFeedPost(
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
  ): Promise<FeedPost>;
  reactToPost(actorId: string, postId: string, kind: ReactionKind): Promise<FeedPost>;
  askQuestion(actorId: string, postId: string, question: string): Promise<PostQuestion>;
  /** Asker sees their own; staff see all; everyone sees published FAQs. */
  getQuestionsForPost(actorId: string, postId: string): Promise<PostQuestion[]>;
  answerQuestion(
    actorId: string,
    questionId: string,
    answer: string,
    publishAsFaq: boolean
  ): Promise<PostQuestion>;
  /** Staff moderation queue of unanswered questions across posts. */
  getOpenQuestions(actorId: string): Promise<PostQuestion[]>;

  /* notifications (#2) */
  getNotifications(actorId: string): Promise<AppNotification[]>;
  getUnreadNotificationCount(actorId: string): Promise<number>;
  markNotificationRead(actorId: string, notificationId: string): Promise<void>;
  markAllNotificationsRead(actorId: string): Promise<void>;
  getNotificationPrefs(actorId: string): Promise<NotificationPrefs>;
  updateNotificationPrefs(
    actorId: string,
    prefs: Partial<Omit<NotificationPrefs, "userId">>
  ): Promise<NotificationPrefs>;
  /** Staff broadcast: writes an in-app record for every targeted user. */
  broadcastNotification(
    actorId: string,
    input: { type: NotificationType; title: string; body: string; url?: string; audience: FeedAudience }
  ): Promise<{ recipients: number }>;

  /* email (#1) */
  getEmailTemplates(actorId: string): Promise<EmailTemplate[]>;
  getEmailSends(actorId: string): Promise<EmailSend[]>;
  sendEmail(
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
  ): Promise<EmailSend>;
  /** Users a given audience resolves to (for previews and counts). */
  resolveAudience(actorId: string, audience: FeedAudience): Promise<User[]>;
}

/** Thrown by adapters when the actor is not allowed to see/do something. */
export class AccessDeniedError extends Error {
  constructor(message = "Access denied") {
    super(message);
    this.name = "AccessDeniedError";
  }
}
