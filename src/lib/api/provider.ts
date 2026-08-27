import type {
  CastPerformance,
  AbsenceReport,
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
  StaffAssignment,
  StaffProfile,
  Student,
  User,
  CallResponseRecord,
  LoanedScript,
  VolunteerSheet,
} from "./types";
import type { UploadSource } from "./storage";
import type { OpenOffering } from "./catalog/offerings";
import type { ProductionRun } from "./productions/run";
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
import type {
  DocumentCategory,
  FamilyDocument,
  FsaStatement,
} from "./documents/types";
import type {
  Message,
  MessageThread,
  MessageTopic,
  StartThreadInput,
  ThreadStatus,
  ThreadWithMessages,
} from "./messages/types";
import type { Customization, Product } from "./store/catalog";
import type {
  AuditionEvaluation,
  AuditionProfile,
  CastingBoard,
  CastingConfirmation,
  Discipline,
  GrowthRecommendation,
  RoleTier,
  ShowRole,
  ShowScene,
} from "./auditions/types";
import type { LessonBooking, LessonSlot } from "./lessons/types";
import type {
  Review,
  ReviewAggregate,
  ReviewScores,
  ReviewSubjectType,
  ReviewWindow,
  StaffReviewView,
  TrendPoint,
} from "./reviews/types";

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
  /**
   * Edit a parent's own details. Families keep their own contact information
   * current far better than an office can, so this is theirs to change —
   * but not `isPrimary` or `userId`, which decide who the account belongs to.
   */
  updateGuardian(
    actorId: string,
    guardianId: string,
    patch: Partial<Pick<Guardian, "fullName" | "email" | "phone" | "relationship" | "photoUrl">>
  ): Promise<Guardian>;
  /**
   * Add another parent or guardian to the household, without sending them an
   * invitation. Tony, 17 Aug 2026: "Add a second parent, add a third parent,
   * add a fourth parent if they would like to." A record of who a child's
   * grown-ups are is useful even before anyone gets a login.
   */
  addGuardian(
    actorId: string,
    familyId: string,
    guardian: Pick<Guardian, "fullName" | "email" | "phone" | "relationship">
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
  /**
   * Every show's run — first and last performance, and how many — keyed by
   * production id.
   *
   * Exists because `productions.opens_on` is null on all of them: the run is
   * scheduled in the staff portal and arrives as calendar events. Any page
   * listing shows needs their dates, and twenty-four separate calendar reads
   * to build one list is not a page load.
   */
  getProductionRuns(): Promise<Record<string, ProductionRun>>;

  /* enrollments & casting */
  getEnrollmentsForStudent(actorId: string, studentId: string): Promise<Enrollment[]>;
  getEnrollmentsForFamily(actorId: string, familyId: string): Promise<Enrollment[]>;
  getCastingForStudent(actorId: string, studentId: string): Promise<CastingAssignment[]>;

  /* staff */
  getStaffProfiles(): Promise<StaffProfile[]>;
  getStaffProfile(staffId: string): Promise<StaffProfile | null>;
  /**
   * The colleagues assigned to this family's own shows and classes, each with
   * the role they hold on it.
   *
   * Not the whole company. Tony, 17 Aug 2026: "They don't need to see the
   * whole staff, but they need to see the staff that are assigned to that
   * class or that show." Twenty-four shows' worth of creative teams is a
   * directory; the four people teaching your child is an answer.
   */
  getStaffForFamily(actorId: string, familyId: string): Promise<StaffAssignment[]>;

  /**
   * What is open for registration right now, from the org's own catalog.
   * Empty when the catalog is unreachable — the dashboard then says nothing
   * rather than showing a family a stale list of things to buy.
   */
  listOpenOfferings(): Promise<OpenOffering[]>;

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
  /**
   * One show's whole calendar, for any signed-in user.
   *
   * getFamilyCalendar answers "what is MY child called to", which is the right
   * question on the schedule page and the wrong one on a show page: a family
   * looking at a production wants the run — including the calls their child is
   * not in, so they can see where the week is going. A rehearsal schedule is
   * not personal data, so this is not scoped to enrollment.
   */
  getProductionCalendar(actorId: string, productionId: string): Promise<CalendarEvent[]>;
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

  /* absences from a show */
  getAbsenceReportsForFamily(actorId: string, familyId: string): Promise<AbsenceReport[]>;
  /**
   * File one. Returns the stored row so the caller can notify AFTER it is
   * safe — a mail failure must never lose a parent telling us their child is
   * ill.
   */
  createAbsenceReport(
    actorId: string,
    input: Omit<AbsenceReport, "id" | "familyId" | "createdAt" | "notified">
  ): Promise<AbsenceReport>;
  /** Records who the notification reached, once the mail has been attempted. */
  recordAbsenceNotified(
    actorId: string,
    reportId: string,
    mailboxes: string[]
  ): Promise<void>;
  /** Staff: every report, most recent first. */
  getAbsenceReportsForStaff(actorId: string): Promise<AbsenceReport[]>;

  /* loaned scripts (staff portal 0159) */
  /** Numbered scripts signed out to this family's students. */
  getMyScripts(actorId: string): Promise<LoanedScript[]>;

  /* answering a call — attending / conflict (hub 0049) */
  /** Every answer this family has given, for drawing on the calendar. */
  getMyCallResponses(actorId: string): Promise<CallResponseRecord[]>;
  /** Answer one call for one child, or "clear" to take the answer back. */
  respondToCall(
    actorId: string,
    input: {
      eventId: string;
      studentId: string;
      status: "attending" | "not_attending" | "injury" | "partial" | "clear";
      reason?: string;
    }
  ): Promise<{ ok: boolean; message?: string }>;

  /* volunteer sign-ups (hub 0048) */
  /** Published sheets for the shows this family is actually on. */
  getVolunteerSheets(actorId: string): Promise<VolunteerSheet[]>;
  /** Take a place. Capacity is checked under a row lock, so this can refuse. */
  claimVolunteerSlot(
    actorId: string,
    input: { slotId: string; volunteerName: string; phone?: string; note?: string }
  ): Promise<{ ok: boolean; message?: string }>;
  /** Give back a place — only ever your own. */
  releaseVolunteerSlot(actorId: string, signupId: string): Promise<void>;

  /* early pickup / late drop-off (#10) */
  getPickupRequestsForFamily(actorId: string, familyId: string): Promise<PickupRequest[]>;
  createPickupRequest(
    actorId: string,
    input: Omit<PickupRequest, "id" | "familyId" | "status" | "createdAt" | "decisionNote" | "decidedByName" | "decidedAt" | "feeCents">
  ): Promise<PickupRequest>;
  /**
   * A parent pressing "I'm here" at the kerb.
   *
   * Idempotent on purpose: a second press must not restart the clock or send a
   * second alert, because the natural response to silence is to press again.
   */
  markPickupArrived(
    actorId: string,
    requestId: string,
    byName: string
  ): Promise<{ request: PickupRequest; alreadyArrived: boolean }>;
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

  /* private reviews (#15) */

  /** Windows currently open to this family, with whether they've responded. */
  getOpenReviewWindows(
    actorId: string
  ): Promise<Array<{ window: ReviewWindow; subjectName: string; alreadySubmitted: boolean }>>;

  submitReview(
    actorId: string,
    input: {
      windowId: string;
      scores: ReviewScores;
      comment: string;
      isAnonymous: boolean;
    }
  ): Promise<Review>;

  /** The family's own submissions. */
  getMyReviews(actorId: string): Promise<Review[]>;

  /**
   * Staff-facing: identity-stripped reviews about this staff member's own
   * work, plus aggregates. Never returns reviewer ids.
   */
  getReviewsForStaff(
    actorId: string,
    staffId: string
  ): Promise<{ reviews: StaffReviewView[]; aggregate: ReviewAggregate; trend: TrendPoint[] }>;

  /** Admin-only: full reviews including reviewer identity. */
  getAllReviews(actorId: string): Promise<Review[]>;

  getReviewAggregate(
    actorId: string,
    subjectType: ReviewSubjectType,
    subjectId: string
  ): Promise<{ aggregate: ReviewAggregate; trend: TrendPoint[] }>;

  flagReview(actorId: string, reviewId: string, reason: string): Promise<Review>;
  resolveReview(actorId: string, reviewId: string, note: string): Promise<Review>;

  /** Admin: open a review window for a class or production. */
  createReviewWindow(
    actorId: string,
    input: Omit<ReviewWindow, "id">
  ): Promise<ReviewWindow>;

  /* student materials (#4) */
  setHeadshot(
    actorId: string,
    studentId: string,
    files: { webDataUrl: string; printDataUrl: string }
  ): Promise<Student>;
  setResumePdf(actorId: string, studentId: string, source: UploadSource): Promise<Student>;
  setAuditionAudio(actorId: string, studentId: string, source: UploadSource): Promise<Student>;
  clearAuditionAudio(actorId: string, studentId: string): Promise<Student>;
  saveResumeCredits(
    actorId: string,
    studentId: string,
    credits: ResumeCredit[]
  ): Promise<Student>;

  /* household document vault (#3) */
  getFamilyDocuments(actorId: string, familyId: string): Promise<FamilyDocument[]>;
  uploadFamilyDocument(
    actorId: string,
    familyId: string,
    input: {
      name: string;
      category: DocumentCategory;
      source: UploadSource;
      studentId?: string;
    }
  ): Promise<FamilyDocument>;
  deleteFamilyDocument(actorId: string, documentId: string): Promise<void>;

  /* Dependent Care FSA statement */
  getFsaStatement(
    actorId: string,
    studentId: string,
    period: { start: string; end: string }
  ): Promise<FsaStatement>;

  /* families directory — staff and admin only (#3) */
  getFamiliesDirectory(actorId: string): Promise<
    Array<{
      family: Family;
      students: Student[];
      guardians: Guardian[];
    }>
  >;

  /* staff self-edit with admin approval (#14) */
  submitStaffProfileChanges(
    actorId: string,
    staffId: string,
    changes: {
      bio?: string;
      title?: string;
      specialties?: string[];
      credits?: string;
      familyMessage?: string;
      photoDataUrl?: string;
    }
  ): Promise<StaffProfile>;
  getPendingStaffChanges(actorId: string): Promise<StaffProfile[]>;
  approveStaffChanges(actorId: string, staffId: string): Promise<StaffProfile>;
  rejectStaffChanges(actorId: string, staffId: string, reason: string): Promise<StaffProfile>;

  /* email open + click tracking (#1) */
  recordEmailOpen(sendId: string, recipientId: string): Promise<void>;
  recordEmailClick(sendId: string, recipientId: string, url: string): Promise<void>;
  getEmailEngagement(
    actorId: string,
    sendId: string
  ): Promise<{
    opens: Array<{ recipientId: string; recipientName: string; at: string }>;
    clicks: Array<{ recipientId: string; recipientName: string; url: string; at: string }>;
    nonOpeners: User[];
  }>;

  /* direct messages to the office */
  /**
   * The concerns a family can pick, live from the staff portal's contact tree.
   * Empty when the bridge is unreachable — the form then falls back to the two
   * roles rather than showing a family nothing.
   */
  listMessageTopics(): Promise<MessageTopic[]>;
  /**
   * The same list plus this family's own shows and classes, each routed to
   * whoever runs it. Computed per request — a stored copy would start
   * disagreeing with who is actually assigned the first time somebody swapped.
   */
  listMessageTopicsForFamily(actorId: string, familyId: string): Promise<MessageTopic[]>;
  startMessageThread(actorId: string, input: StartThreadInput): Promise<MessageThread>;
  replyToThread(actorId: string, threadId: string, body: string): Promise<Message>;
  getMyThreads(actorId: string): Promise<MessageThread[]>;
  getThread(actorId: string, threadId: string): Promise<ThreadWithMessages | null>;
  /** Threads a staff member covers, or is named on. */
  getStaffInbox(actorId: string): Promise<ThreadWithMessages[]>;
  setThreadStatus(actorId: string, threadId: string, status: ThreadStatus): Promise<MessageThread>;
  markThreadRead(actorId: string, threadId: string): Promise<void>;
  getUnreadMessageCount(actorId: string): Promise<number>;

  /* auditions & casting */

  /** Family (or 13+ student) submits/updates the audition profile. */
  submitAuditionProfile(
    actorId: string,
    input: {
      studentId: string;
      productionId: string;
      preferenceTier: RoleTier;
      previousRoles: string;
      hopes: string;
      /** What to consider them for. Independent — none of them is valid. */
      wantsSpeaking?: boolean;
      wantsSinging?: boolean;
      wantsDance?: boolean;
      /** Prepared for THIS show, not carried from the last one. */
      songTitle?: string;
      songUrl?: string;
      /**
       * Storage URLs. Undefined means "the form did not touch this" and the
       * existing value stands; empty string clears it. Uploads reach storage
       * directly from the browser, so by the time this runs the file is
       * already there and only its address is traveling.
       */
      auditionVideoUrl?: string;
      danceVideoUrl?: string;
      resumeUrl?: string;
      notes?: string;
      /** Must be true — the no-guarantee acknowledgment. */
      acknowledgedNoGuarantee: boolean;
    }
  ): Promise<AuditionProfile>;
  getAuditionProfile(
    actorId: string,
    studentId: string,
    productionId: string
  ): Promise<AuditionProfile | null>;

  /**
   * Staff: every registered student for a production with their audition
   * profile, materials, and evaluations so far. The "no student forgotten"
   * roster — driven by registration enrollments.
   */
  getAuditionRoster(
    actorId: string,
    productionId: string
  ): Promise<
    Array<{
      student: Student;
      profile: AuditionProfile | null;
      evaluations: AuditionEvaluation[];
    }>
  >;

  /** Discipline lead scores a student's rubric. One per discipline/student. */
  submitEvaluation(
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
  ): Promise<AuditionEvaluation>;

  getShowRoles(productionId: string): Promise<ShowRole[]>;

  /** The casting board: roles, current entries, and unassigned students. */
  getCastingBoard(
    actorId: string,
    productionId: string
  ): Promise<{
    board: CastingBoard;
    roles: ShowRole[];
    /** Registered students not yet placed. Must be empty to submit. */
    unassigned: Student[];
    studentsById: Record<string, Student>;
  }>;
  assignRole(
    actorId: string,
    productionId: string,
    roleId: string,
    studentId: string
  ): Promise<void>;
  unassignRole(actorId: string, productionId: string, studentId: string): Promise<void>;

  /**
   * Submit casting. Fails unless every registered student is assigned.
   * Creates published assignments, notifies each family of THEIR child's
   * role only, and opens the confirmation window.
   */
  submitCasting(
    actorId: string,
    productionId: string
  ): Promise<{ assignmentsCreated: number; familiesNotified: number }>;

  /** The family's confirmations for their own children. */
  getMyCastingConfirmations(
    actorId: string
  ): Promise<
    Array<{
      confirmation: CastingConfirmation;
      roleName: string;
      productionTitle: string;
      studentName: string;
      /**
       * The nights this child plays this part, when the part is shared with
       * somebody else. Absent or empty means the whole run — which is the
       * ordinary case and the reason the page says nothing at all then.
       */
      performances?: CastPerformance[];
    }>
  >;
  respondToCasting(
    actorId: string,
    confirmationId: string,
    response: { nameCorrect: boolean; playbillName?: string }
  ): Promise<CastingConfirmation>;

  /** Family requests feedback → releases that child's rubrics to them. */
  requestAuditionFeedback(
    actorId: string,
    confirmationId: string
  ): Promise<AuditionEvaluation[]>;

  /** Growth recommendations from the rubric, tied to lessons/classes. */
  getGrowthRecommendations(
    actorId: string,
    studentId: string,
    productionId: string
  ): Promise<GrowthRecommendation[]>;

  /* understudies — leads only, after the main board is submitted */
  assignUnderstudy(
    actorId: string,
    productionId: string,
    roleId: string,
    studentId: string
  ): Promise<void>;
  unassignUnderstudy(actorId: string, productionId: string, studentId: string): Promise<void>;
  /** Lead roles without an understudy — "where the holes are". */
  getUnderstudyHoles(actorId: string, productionId: string): Promise<ShowRole[]>;
  publishUnderstudies(
    actorId: string,
    productionId: string
  ): Promise<{ published: number; holes: number }>;

  /**
   * Re-notify families whose casting confirmation is still unanswered.
   * Runs from an hourly cron; each family is reminded at most every 12h
   * (CONFIRMATION_REMINDER_MS). `olderThanMs` is overridable for tests.
   */
  remindPendingCastingConfirmations(
    actorId: string,
    options?: { olderThanMs?: number }
  ): Promise<{ reminded: number }>;

  /**
   * Staff: the whole cast list with per-role status for playbill and
   * registration tracking. A role is "open" until someone is assigned,
   * "filled" once cast, and "accepted" when every family holding it has
   * confirmed the playbill name.
   */
  getCastListStatus(
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
  >;

  /** Scenes/musical numbers for a production, mapped to the roles called. */
  getShowScenes(productionId: string): Promise<ShowScene[]>;

  /**
   * Family-facing: exactly which scenes/songs a child is in, and as whom.
   * Understudies see every scene of the lead role they cover, marked.
   */
  getStudentSceneBreakdown(
    actorId: string,
    studentId: string,
    productionId: string
  ): Promise<Array<{ scene: ShowScene; roleName: string; isUnderstudy: boolean }>>;

  /**
   * Hourly cron: 24h-before rehearsal reminders and post-rehearsal
   * thank-yous, per family, deduped so re-runs never double-send.
   */
  runRehearsalNotices(
    actorId: string,
    options?: { now?: string }
  ): Promise<{ reminders: number; thanks: number }>;

  /** Staff: playbill corrections and confirmation status. */
  getCastingResponses(
    actorId: string,
    productionId: string
  ): Promise<
    Array<{
      confirmation: CastingConfirmation;
      studentName: string;
      roleName: string;
    }>
  >;

  /* private lessons: weekly recurring slots with the same teacher */

  /** Every slot with open/taken status. Who holds a slot stays private. */
  getLessonSlots(actorId: string): Promise<
    Array<{
      slot: LessonSlot;
      teacherName: string;
      teacherTitle: string;
      status: "open" | "taken" | "yours";
      bookingId?: string;
      studentName?: string;
    }>
  >;

  /** Book a weekly recurring slot for one of your children (capacity 1). */
  bookLessonSlot(
    actorId: string,
    input: { slotId: string; studentId: string; goals?: string }
  ): Promise<LessonBooking>;

  /** Cancel the standing booking; the slot opens for other families. */
  cancelLessonBooking(actorId: string, bookingId: string): Promise<void>;

  getMyLessonBookings(actorId: string): Promise<
    Array<{
      booking: LessonBooking;
      slot: LessonSlot;
      teacherName: string;
      studentName: string;
      nextLessonAt: string;
    }>
  >;

  /** Staff: the teaching week — every slot and who's in it. */
  getLessonRoster(actorId: string): Promise<
    Array<{
      slot: LessonSlot;
      teacherName: string;
      studentName?: string;
      familyName?: string;
      goals?: string;
      startDate?: string;
    }>
  >;

  /* store catalog: star pages, lessons, and other products */
  getProducts(productionId?: string): Promise<Product[]>;
  addCatalogItemToCart(
    actorId: string,
    input: {
      productId: string;
      optionValue?: string;
      quantity: number;
      customization: Customization;
    }
  ): Promise<CartItem[]>;
}

/** Thrown by adapters when the actor is not allowed to see/do something. */
export class AccessDeniedError extends Error {
  constructor(message = "Access denied") {
    super(message);
    this.name = "AccessDeniedError";
  }
}
