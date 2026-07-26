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
} from "./types";
import type {
  AccountLink,
  RegistrationSnapshot,
  RegistrationSource,
  SyncRun,
} from "./registration/types";
import type {
  ConsentEvent,
  Gallery,
  GalleryPhoto,
  PhotoMatch,
  ReferencePhoto,
} from "./photos/types";

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

  /* family calendar (#5) */
  getFamilyCalendar(actorId: string, familyId: string): Promise<FamilyCalendarEvent[]>;
  /** All events, staff view (rosters, daily ops). */
  getAllEvents(actorId: string): Promise<CalendarEvent[]>;
  /** Stable per-family token for the iCal feed URL. */
  getCalendarToken(actorId: string, familyId: string): Promise<string>;
  /** Reverse lookup for the public .ics route. Returns null for bad tokens. */
  getFamilyIdByCalendarToken(token: string): Promise<string | null>;

  /* health forms (#9) */
  getHealthForm(actorId: string, studentId: string, seasonId: string): Promise<HealthForm | null>;
  /** Previous season's answers for pre-fill re-attest, if any. */
  getPreviousHealthForm(actorId: string, studentId: string, seasonId: string): Promise<HealthForm | null>;
  saveHealthForm(
    actorId: string,
    studentId: string,
    seasonId: string,
    answers: HealthFormAnswers,
    signature?: { name: string; ip: string }
  ): Promise<HealthForm>;
  /** Staff: completion status per production/class + emergency roster. */
  getHealthFormStatus(
    actorId: string,
    scope: { productionId?: string; classId?: string }
  ): Promise<Array<{ student: Student; form: HealthForm | null }>>;

  /* early drop-off / late pick-up (#10) */
  getPickupRequestsForFamily(actorId: string, familyId: string): Promise<PickupRequest[]>;
  createPickupRequest(
    actorId: string,
    input: Omit<PickupRequest, "id" | "familyId" | "status" | "createdAt" | "decisionNote" | "decidedByName" | "decidedAt" | "feeCents">
  ): Promise<PickupRequest>;
  /** Staff: all pending requests + today's approved roster. */
  getPickupRequestsForStaff(actorId: string): Promise<PickupRequest[]>;
  decidePickupRequest(
    actorId: string,
    requestId: string,
    decision: { status: "approved" | "denied"; note?: string }
  ): Promise<PickupRequest>;

  /* registration integration (#8) */
  /** Reconcile a snapshot into app data. Staff only. */
  syncRegistration(
    actorId: string,
    snapshot: RegistrationSnapshot,
    trigger: SyncRun["trigger"]
  ): Promise<SyncRun>;
  /** Record a failed sync attempt so failures surface instead of vanishing. */
  recordSyncFailure(
    actorId: string,
    source: RegistrationSource,
    trigger: SyncRun["trigger"],
    error: string
  ): Promise<SyncRun>;
  getSyncRuns(actorId: string): Promise<SyncRun[]>;
  getAccountLinks(actorId: string): Promise<AccountLink[]>;
  linkAccount(
    actorId: string,
    link: Omit<AccountLink, "linkedAt" | "autoMatched">
  ): Promise<AccountLink>;
  unlinkAccount(actorId: string, familyId: string, source: RegistrationSource): Promise<void>;
  /** The link for one family, for the dashboard's registration card. */
  getAccountLinkForFamily(
    actorId: string,
    familyId: string
  ): Promise<AccountLink | null>;

  /* spirit buttons store (#11) */
  getButtonTemplates(productionId?: string): Promise<ButtonTemplate[]>;
  upsertButtonTemplate(
    actorId: string,
    template: Omit<ButtonTemplate, "id"> & { id?: string }
  ): Promise<ButtonTemplate>;

  getCart(actorId: string): Promise<CartItem[]>;
  addToCart(actorId: string, design: ButtonDesign, quantity: number): Promise<CartItem[]>;
  updateCartItem(actorId: string, itemId: string, quantity: number): Promise<CartItem[]>;
  removeCartItem(actorId: string, itemId: string): Promise<CartItem[]>;
  clearCart(actorId: string): Promise<void>;

  /** Turn the cart into an unpaid order. */
  createOrder(actorId: string, paymentRef: string): Promise<ButtonOrder>;
  /** Mark an order paid once the processor confirms. */
  markOrderPaid(orderReference: string, paymentRef: string): Promise<ButtonOrder | null>;
  getOrdersForFamily(actorId: string, familyId: string): Promise<ButtonOrder[]>;
  getOrder(actorId: string, orderId: string): Promise<ButtonOrder | null>;
  /** Admin fulfillment queue. */
  getAllOrders(actorId: string, status?: OrderStatus): Promise<ButtonOrder[]>;
  updateOrderStatus(
    actorId: string,
    orderId: string,
    status: OrderStatus,
    note?: string
  ): Promise<ButtonOrder>;
  /** Re-add a past order's items to the cart. */
  reorder(actorId: string, orderId: string): Promise<CartItem[]>;

  /* photos & face matching (#6) */

  /**
   * Grant face-matching consent for a student. Parent-only; the student's
   * reference photos must already be uploaded or are supplied here.
   */
  grantFaceConsent(
    actorId: string,
    studentId: string,
    referenceImageUrls: string[]
  ): Promise<{ embeddingsCreated: number }>;

  /**
   * Revoke consent. MUST delete every embedding, reference photo, and match
   * for the student, and record what was deleted (#6, PRIVACY.md).
   */
  revokeFaceConsent(actorId: string, studentId: string): Promise<ConsentEvent>;

  getConsentHistory(actorId: string, studentId: string): Promise<ConsentEvent[]>;
  getReferencePhotos(actorId: string, studentId: string): Promise<ReferencePhoto[]>;

  /** Diagnostic: how many embeddings exist for a student. Used by tests. */
  countEmbeddingsForStudent(actorId: string, studentId: string): Promise<number>;

  getGalleries(actorId: string): Promise<Gallery[]>;
  getGalleryPhotos(actorId: string, galleryId: string): Promise<GalleryPhoto[]>;

  /** Photos matched to this family's students, newest first. */
  getMatchesForFamily(
    actorId: string,
    familyId: string
  ): Promise<Array<{ match: PhotoMatch; photo: GalleryPhoto; studentName: string }>>;

  /** Parent correction: "that isn't my child". */
  rejectMatch(actorId: string, matchId: string): Promise<void>;
  /** Parent confirmation, which strengthens the reference set. */
  confirmMatch(actorId: string, matchId: string): Promise<void>;

  /* background ingestion + matching job (never called during page render) */
  ingestGallery(
    actorId: string,
    gallery: Gallery,
    photos: GalleryPhoto[]
  ): Promise<{ photosIngested: number }>;
  runMatching(actorId: string): Promise<{ photosScanned: number; matchesCreated: number }>;
}

/** Thrown by adapters when the actor is not allowed to see/do something. */
export class AccessDeniedError extends Error {
  constructor(message = "Access denied") {
    super(message);
    this.name = "AccessDeniedError";
  }
}
