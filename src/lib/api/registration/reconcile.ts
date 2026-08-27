import type {
  ClassOffering,
  Enrollment,
  Family,
  Guardian,
  Production,
  Student,
} from "../types";
import type {
  AccountLink,
  RegistrationSnapshot,
  RegistrationSource,
  SyncIssue,
} from "./types";

/**
 * Pure reconciliation: given what the app knows and what the registration
 * system says, produce a plan of changes plus a list of things a human needs
 * to look at. No I/O, no mutation — so it is unit-testable and identical for
 * the mock and Supabase data layers.
 *
 * Matching strategy, most to least reliable:
 *   account     → existing AccountLink, else case-insensitive guardian email
 *   participant → name + date of birth within the matched family, else name
 *   offering    → exact production/class title, else normalized title
 *
 * Anything that fails to match becomes a SyncIssue rather than a guess.
 * Silent wrong matches are worse than a visible unmatched row.
 */

export interface ReconcileInput {
  snapshot: RegistrationSnapshot;
  families: Family[];
  guardians: Guardian[];
  students: Student[];
  enrollments: Enrollment[];
  productions: Production[];
  classes: ClassOffering[];
  links: AccountLink[];
  /**
   * Website activity ids the STAFF PORTAL publishes as coaching, from
   * `staff_portal.v_coaching_catalog`. Coaching is the portal's business and
   * has no production or class here, so this is the only thing that lets a
   * coaching purchase resolve. Absent (or empty) and coaching behaves exactly
   * as it did before: reported as an unknown offering rather than guessed at.
   */
  coachingActivityIds?: ReadonlySet<number>;
  /**
   * Enrollment id → the registration line item it was created from, for rows
   * that already carry one.
   *
   * A row added by hand has no line item, and the app model deliberately does
   * not carry one either — it is sync bookkeeping, not something a family
   * sees. Passing it in separately lets an adopted row be stamped without
   * widening Enrollment. Absent, nothing is stamped and behaviour is
   * unchanged.
   */
  enrollmentExternalIds?: ReadonlyMap<string, string>;
}

export interface PlannedEnrollment {
  studentId: string;
  productionId?: string;
  classId?: string;
  coachingActivityId?: number;
  balanceCents: number;
  status: Enrollment["status"];
  externalId: string;
  source: RegistrationSource;
  /**
   * activities.category from the registration system. Carried through because
   * a Dependent Care FSA turns on it: day camp is qualifying care, a weekly
   * class is not. It used to be dropped here, which is why the statement had
   * no way to tell them apart.
   */
  offeringCategory?: string;
  /** Paid to date, from the snapshot. Undefined when the source has no figure. */
  amountPaidCents?: number;
  /**
   * When the care runs, captured from the catalog at first sight. See the
   * capture-once rule in the update branch for why it is never rewritten.
   */
  sessionStartsOn?: string;
  sessionEndsOn?: string;
}

export interface PlannedUpdate {
  enrollmentId: string;
  balanceCents?: number;
  status?: Enrollment["status"];
  /**
   * Paid to date. Tracked as its own change, because a family paying off a
   * balance moves this even when nothing else about the enrollment does — and
   * an FSA statement built from a stale figure understates what they can claim.
   */
  amountPaidCents?: number;
  /**
   * Backfilled as well as created. Every enrollment that existed before this
   * column did has a null category, and a null category is excluded from FSA
   * statements — so without this, an established family would never see a camp
   * fee no matter how many times the sync ran.
   */
  offeringCategory?: string;
  /** When the care runs. Captured once; see the update rule below. */
  sessionStartsOn?: string;
  sessionEndsOn?: string;
  /**
   * The registration line item, written onto a row that had none.
   *
   * Rows added by hand carry no line item. They are matched by student and
   * target so they are adopted rather than duplicated, but without this they
   * stay unkeyed for ever — indistinguishable from a row we invented, and
   * impossible to trace back to what the family actually paid for.
   */
  externalId?: string;
}

export interface ReconcilePlan {
  creates: PlannedEnrollment[];
  updates: PlannedUpdate[];
  /** Links inferred by email that did not already exist. */
  autoLinks: AccountLink[];
  issues: SyncIssue[];
  counts: {
    accountsSeen: number;
    enrollmentsSeen: number;
    enrollmentsCreated: number;
    enrollmentsUpdated: number;
    balancesUpdated: number;
  };
}

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[‐-―]/g, "-") // unicode dashes → hyphen
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function reconcile(input: ReconcileInput): ReconcilePlan {
  const { snapshot } = input;
  const plan: ReconcilePlan = {
    creates: [],
    updates: [],
    autoLinks: [],
    issues: [],
    counts: {
      accountsSeen: snapshot.accounts.length,
      enrollmentsSeen: snapshot.enrollments.length,
      enrollmentsCreated: 0,
      enrollmentsUpdated: 0,
      balancesUpdated: 0,
    },
  };

  /* ── 1. accounts → families ─────────────────────────────────────────── */

  const familyByExternalId = new Map<string, string>();
  for (const link of input.links) {
    if (link.source === snapshot.source) {
      familyByExternalId.set(link.externalId, link.familyId);
    }
  }

  // Guardian email → familyId, for auto-matching unlinked accounts.
  const familyByEmail = new Map<string, string>();
  for (const guardian of input.guardians) {
    familyByEmail.set(guardian.email.trim().toLowerCase(), guardian.familyId);
  }

  for (const account of snapshot.accounts) {
    if (familyByExternalId.has(account.externalId)) continue;
    const matched = familyByEmail.get(account.email.trim().toLowerCase());
    if (matched) {
      familyByExternalId.set(account.externalId, matched);
      plan.autoLinks.push({
        familyId: matched,
        source: snapshot.source,
        externalId: account.externalId,
        externalEmail: account.email.toLowerCase(),
        linkedAt: snapshot.fetchedAt,
        autoMatched: true,
      });
    } else {
      plan.issues.push({
        kind: "unmatched_account",
        externalId: account.externalId,
        message: `No app family matches "${account.guardianName}" <${account.email}>. They may not have signed up for the app yet.`,
      });
    }
  }

  /* ── 2. participants → students ─────────────────────────────────────── */

  const studentByParticipantId = new Map<string, string>();
  const studentsByFamily = new Map<string, Student[]>();
  for (const student of input.students) {
    const list = studentsByFamily.get(student.familyId) ?? [];
    list.push(student);
    studentsByFamily.set(student.familyId, list);
  }

  for (const participant of snapshot.participants) {
    const familyId = familyByExternalId.get(participant.accountExternalId);
    if (!familyId) continue; // already reported as unmatched_account

    const candidates = studentsByFamily.get(familyId) ?? [];
    const wantFirst = normalize(participant.firstName);
    const wantLast = normalize(participant.lastName);

    // Prefer an exact name + DOB match; fall back to name alone.
    const exact = candidates.find(
      (student) =>
        normalize(student.firstName) === wantFirst &&
        normalize(student.lastName) === wantLast &&
        (!participant.dateOfBirth || student.dateOfBirth === participant.dateOfBirth)
    );
    const byName = candidates.find(
      (student) =>
        normalize(student.firstName) === wantFirst && normalize(student.lastName) === wantLast
    );
    const match = exact ?? byName;

    if (match) {
      studentByParticipantId.set(participant.externalId, match.id);
    } else {
      plan.issues.push({
        kind: "unmatched_participant",
        externalId: participant.externalId,
        message: `Registered participant "${participant.firstName} ${participant.lastName}" has no matching student profile in this family.`,
      });
    }
  }

  /* ── 3. offerings → productions / classes ──────────────────────────── */

  /*
   * TWO WAYS TO MATCH, AND ONLY ONE OF THEM IS SOUND.
   *
   * By activity id: the registration listing and the app row were created
   * together by the staff portal, which wrote both ids at once. Nothing a
   * human types afterwards can break it.
   *
   * By name: the original, and a guess. It compares a listing's display name
   * with a production title after stripping punctuation and case — so
   * "Frozen JR." finds "Frozen Jr", which is the point. But it also means a
   * renamed show stops matching, two shows with the same title in different
   * seasons are indistinguishable, and an offering the portal has just
   * published resolves to nothing until somebody makes the titles agree
   * character for character.
   *
   * So the id wins where there is one, and the name is the fallback for the
   * rows that predate it. A wrong id match is impossible; a wrong name match
   * is merely unlikely, and the difference matters because the thing being
   * matched is a child's place in a show.
   */
  const productionByActivityId = new Map<number, string>();
  const productionByName = new Map<string, string>();
  for (const production of input.productions) {
    if (production.registrationActivityId != null) {
      productionByActivityId.set(production.registrationActivityId, production.id);
    }
    productionByName.set(normalize(production.title), production.id);
  }
  const classByActivityId = new Map<number, string>();
  const classByName = new Map<string, string>();
  for (const offering of input.classes) {
    if (offering.registrationActivityId != null) {
      classByActivityId.set(offering.registrationActivityId, offering.id);
    }
    classByName.set(normalize(offering.name), offering.id);
  }

  /* ── 4. enrollments ─────────────────────────────────────────────────── */

  // Existing app enrollments indexed by (student, target) so a re-run is a
  // no-op rather than creating duplicates.
  const existingByKey = new Map<string, Enrollment>();
  for (const enrollment of input.enrollments) {
    const target =
      enrollment.productionId ??
      enrollment.classId ??
      (enrollment.coachingActivityId != null
        ? `coaching:${enrollment.coachingActivityId}`
        : "");
    existingByKey.set(`${enrollment.studentId}::${target}`, enrollment);
  }

  const coachingIds = input.coachingActivityIds ?? new Set<number>();

  for (const external of snapshot.enrollments) {
    const studentId = studentByParticipantId.get(external.participantExternalId);
    if (!studentId) continue; // reported above

    const offeringKey = normalize(external.offeringName);
    const activityId = external.offeringActivityId;
    const productionId =
      (activityId != null ? productionByActivityId.get(activityId) : undefined) ??
      productionByName.get(offeringKey);
    const classId = productionId
      ? undefined
      : (activityId != null ? classByActivityId.get(activityId) : undefined) ??
        classByName.get(offeringKey);

    // Coaching belongs to the staff portal, not here. It has no production and
    // no class, so it resolves against the portal's published catalog by the
    // activity id both systems key on — never by name, and never by guessing
    // from the category alone: an activity the portal does not list stays an
    // unknown offering, which is the whole point of the catalog.
    const coachingActivityId =
      !productionId &&
      !classId &&
      external.offeringCategory === "coaching" &&
      external.offeringActivityId != null &&
      coachingIds.has(external.offeringActivityId)
        ? external.offeringActivityId
        : undefined;

    if (!productionId && !classId && coachingActivityId == null) {
      plan.issues.push({
        kind: "unknown_offering",
        externalId: external.externalId,
        message:
          external.offeringCategory === "coaching"
            ? `"${external.offeringName}" is coaching, but the staff portal's coaching catalog doesn't list it. Add it there (staff_portal.coaching_service_menu) and it will map on the next sync.`
            : `"${external.offeringName}" doesn't match any production or class in the app. Add it, or map it manually.`,
      });
      continue;
    }

    const status: Enrollment["status"] =
      external.status === "cancelled"
        ? "withdrawn"
        : external.status === "waitlisted"
          ? "waitlisted"
          : "enrolled";

    const targetKey =
      productionId ?? classId ?? `coaching:${coachingActivityId}`;
    const existing = existingByKey.get(`${studentId}::${targetKey}`);

    if (!existing) {
      plan.creates.push({
        studentId,
        productionId,
        classId,
        coachingActivityId,
        balanceCents: external.balanceCents,
        status,
        externalId: external.externalId,
        source: snapshot.source,
        offeringCategory: external.offeringCategory,
        amountPaidCents: external.amountPaidCents,
        sessionStartsOn: external.sessionStartsOn,
        sessionEndsOn: external.sessionEndsOn,
      });
      plan.counts.enrollmentsCreated += 1;
      continue;
    }

    const balanceChanged = existing.balanceCents !== external.balanceCents;
    const statusChanged = existing.status !== status;
    // A payment moves this even when the balance lands back on zero and the
    // status never changes, so it is its own test rather than a passenger.
    const paidChanged =
      external.amountPaidCents !== undefined &&
      existing.amountPaidCents !== external.amountPaidCents;
    // Backfill, not just create. Every row that predates the column has a null
    // category, and a null category is excluded from FSA statements — so
    // without this an established family would never see a camp fee, however
    // often the sync ran.
    const categoryChanged =
      external.offeringCategory !== undefined &&
      existing.offeringCategory !== external.offeringCategory;
    /*
     * CAPTURE ONCE, NEVER OVERWRITE.
     *
     * The catalog is a live listing: when a season ends, the same product
     * rolls over to next year's dates. Summer 2026's camps already read
     * Jul 2027 because of it. If this backfilled like the others, every sync
     * after a rollover would rewrite the dates on care a family has already
     * been given — and on a statement they may already have filed.
     *
     * So the dates are written only when the row has none. A wrong capture is
     * corrected by a human clearing the column; a silent annual rewrite is not
     * correctable at all, because nobody would know it happened.
     */
    const captureSession =
      external.sessionStartsOn !== undefined &&
      existing.sessionStartsOn === undefined;
    /*
     * Adopt a hand-added row properly.
     *
     * Matching is by student and target, so a row someone typed straight into
     * the database is updated rather than duplicated. But it keeps no line
     * item, which leaves the one row a human touched as the only one that
     * cannot be traced back to what the family paid. Stamped once, on the
     * first sync that recognises it, and never rewritten afterwards — the
     * line item a row was created from does not change.
     */
    const stampExternalId =
      !input.enrollmentExternalIds?.get(existing.id) && Boolean(external.externalId);
    if (
      balanceChanged ||
      statusChanged ||
      paidChanged ||
      categoryChanged ||
      captureSession ||
      stampExternalId
    ) {
      plan.updates.push({
        enrollmentId: existing.id,
        balanceCents: balanceChanged ? external.balanceCents : undefined,
        status: statusChanged ? status : undefined,
        amountPaidCents: paidChanged ? external.amountPaidCents : undefined,
        offeringCategory: categoryChanged ? external.offeringCategory : undefined,
        sessionStartsOn: captureSession ? external.sessionStartsOn : undefined,
        sessionEndsOn: captureSession ? external.sessionEndsOn : undefined,
        externalId: stampExternalId ? external.externalId : undefined,
      });
      plan.counts.enrollmentsUpdated += 1;
      if (balanceChanged) plan.counts.balancesUpdated += 1;
    }
  }

  return plan;
}
