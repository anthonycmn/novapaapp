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
  SyncStatus,
} from "./types";

/**
 * What a run's issues say about the run. "partial" means a person has
 * something to look at. The legacy bucket is a count for the record, not
 * work, so it does not qualify: from Sep 4 to Sep 20 2026 every run read
 * "partial, 562 issues" on the strength of 556 Sawyer-era rows nobody was
 * ever going to map, and the one real failure among them (a paying family's
 * class order with no room in the app) went unnoticed for two days.
 */
export function syncStatusFor(issues: SyncIssue[]): Extract<SyncStatus, "success" | "partial"> {
  return issues.some((issue) => issue.kind !== "legacy_unmapped") ? "partial" : "success";
}

const studentName = (s?: Student) => (s ? `${s.firstName} ${s.lastName}` : null);

/**
 * One sentence for a line item another enrollment already holds.
 *
 * Two paths reach it and both hit the same unique index
 * (enrollments_external_idx), so they say the same thing:
 *
 *   create  the student has no enrollment for this target, and the insert
 *           would throw 23505. Nothing is written.
 *   adopt   the student HAS one, added by hand and never stamped, and the
 *           stamp would throw 23505. The row still updates; only the link
 *           to the line item is withheld.
 *
 * And two shapes need different sentences. A sibling's row is a wrong child.
 * The same name twice is one child with two student rows, usually in two
 * families, which is what the register's camper_id join exposed on 20 Sep
 * 2026: four of Ryan Rodgers's registrations sat on a duplicate record with
 * no guardian who could sign in, so his family saw one of five. Printing
 * "is for Ryan Rodgers but is held for Ryan Rodgers" would tell nobody
 * anything, so say which record.
 */
function wrongChildIssue(args: {
  externalId: string;
  offeringName: string;
  studentId: string;
  shouldBe?: Student;
  heldBy?: Student;
  heldEnrollmentId: string;
  heldStudentId: string;
  /** The adopt path's own row, when there is one. */
  adoptedEnrollmentId?: string;
}): SyncIssue {
  const { shouldBe, heldBy } = args;
  const sameChild =
    !!heldBy &&
    !!shouldBe &&
    studentName(heldBy)?.toLowerCase() === studentName(shouldBe)?.toLowerCase();
  const head =
    `Registration ${args.externalId} ("${args.offeringName}") is for ` +
    `${studentName(shouldBe) ?? "another student"}`;
  const onRoster = args.adoptedEnrollmentId
    ? `, whose enrollment ${args.adoptedEnrollmentId} is already on the roster`
    : "";

  if (sameChild) {
    const otherFamily =
      heldBy.familyId !== shouldBe.familyId ? ` in family ${heldBy.familyId}` : "";
    return {
      kind: "wrong_child",
      externalId: args.externalId,
      message:
        `${head}, student ${args.studentId} in family ${shouldBe.familyId}${onRoster}, and ` +
        `enrollment ${args.heldEnrollmentId} already carries it for a second record of the ` +
        `same child, student ${args.heldStudentId}${otherFamily}. ` +
        `Merge the duplicate student, then this registration places itself.`,
    };
  }

  return {
    kind: "wrong_child",
    externalId: args.externalId,
    message:
      `${head}${onRoster}, ` +
      `but enrollment ${args.heldEnrollmentId} already carries that registration for ` +
      `${studentName(heldBy) ?? "a different student"}. ` +
      `Nobody's roster changed${args.adoptedEnrollmentId ? " and the balance is still up to date" : ""}. ` +
      `Move the enrollment to the right child, or delete it and let the next sync place it.`,
  };
}

/**
 * Pure reconciliation: given what the app knows and what the registration
 * system says, produce a plan of changes plus a list of things a human needs
 * to look at. No I/O, no mutation — so it is unit-testable and identical for
 * the mock and Supabase data layers.
 *
 * Matching strategy, most to least reliable:
 *   account     → existing AccountLink, else case-insensitive guardian email
 *   participant → students.camper_id (the register's own id), else, only for
 *                 a student that has no camper_id yet, name within the family
 *   offering    → activity id, else normalized title
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
   * Student id → `students.camper_id`, the website's camper id that
   * provisioning stamps on every student it creates from the register.
   *
   * This is THE join between a child here and a child there. A participant
   * whose external id is a camper id resolves through it and nothing else:
   * not the name, not the date of birth. Absent, every student is treated as
   * unkeyed and the name fallback below is all that is left, which is how
   * four children with a nickname or a changed legal name dropped off every
   * sync run in September 2026.
   */
  studentCamperIds?: ReadonlyMap<string, string>;
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
  /**
   * `students.camper_id` to stamp on students that had none and were matched
   * by name this run. Written once; from the next run on, the camper id is
   * the join and the name no longer matters for that child.
   */
  studentLinks: { studentId: string; camperId: string }[];
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
    studentLinks: [],
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

  /*
   * THE CAMPER ID IS THE JOIN. THE NAME IS NOT.
   *
   * A participant's external id is the register's camper id, and provisioning
   * writes that same id onto `students.camper_id` when it creates the student.
   * So the match is one equality, and a nickname ("Katy" for Katelyn, "Bree"
   * for Logan), a changed legal name, or two children with the same name in
   * one household cannot break it. Until Sep 20, 2026 this step compared
   * names, and four children whose parents had typed the name they actually
   * use were dropped from every sync run: no enrollment, no balance, nothing
   * in the portal.
   *
   * The name still has one job. Forty-nine students predate the camper id and
   * carry none, and for those alone a name match inside the linked family is
   * accepted once and then STAMPED (plan.studentLinks), so the next run keys
   * on the id like everyone else. A student that already carries a camper id
   * is never name-matched to a different one; if the ids disagree, the
   * register is right and the row is reported, not guessed at.
   */
  const camperIdOf = input.studentCamperIds ?? new Map<string, string>();
  const studentByCamperId = new Map<string, string>();
  for (const student of input.students) {
    const camperId = camperIdOf.get(student.id);
    if (camperId) studentByCamperId.set(camperId, student.id);
  }
  const studentByParticipantId = new Map<string, string>();
  const studentsByFamily = new Map<string, Student[]>();
  for (const student of input.students) {
    const list = studentsByFamily.get(student.familyId) ?? [];
    list.push(student);
    studentsByFamily.set(student.familyId, list);
  }
  // A camper id adopted by name this run is taken; a second participant
  // cannot adopt the same unkeyed student.
  const adoptedStudents = new Set<string>();

  for (const participant of snapshot.participants) {
    const keyed = studentByCamperId.get(participant.externalId);
    if (keyed) {
      studentByParticipantId.set(participant.externalId, keyed);
      continue;
    }

    const familyId = familyByExternalId.get(participant.accountExternalId);
    if (!familyId) continue; // already reported as unmatched_account

    const candidates = (studentsByFamily.get(familyId) ?? []).filter(
      (student) => !camperIdOf.get(student.id) && !adoptedStudents.has(student.id)
    );
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
      adoptedStudents.add(match.id);
      plan.studentLinks.push({ studentId: match.id, camperId: participant.externalId });
    } else {
      plan.issues.push({
        kind: "unmatched_participant",
        externalId: participant.externalId,
        message: `Registered participant "${participant.firstName} ${participant.lastName}" (camper ${participant.externalId}) has no student with that camper id, and no unkeyed student of that name in the linked family.`,
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

  /*
   * WHAT THE SOURCE RETRACTS, THE HUB WITHDRAWS.
   *
   * Until 13 Sep 2026 this plan only ever created and updated. A row whose
   * source later pointed somewhere else — or nowhere — lived on for ever: ten
   * July "Disney Adventures Camp" campers were filed on the Oct 12 day camp
   * because their legacy rows once carried that activity_id, and when the
   * staff portal cleared the id the hub kept the ten enrollments. Families
   * could open the portal and see a July camper booked into October.
   *
   * So: an existing synced enrollment whose external_id is still in the
   * snapshot but now resolves to a DIFFERENT target, or to none, is marked
   * withdrawn (the sync never deletes; a human deletes) and reported as a
   * conflict naming both. "To none" is only trusted when the old target was
   * matched BY ID and the source no longer carries that id — a row that
   * matched by name and stops matching because somebody renamed a show is
   * an unknown_offering for a human, not a withdrawal.
   */
  const existingByExternalId = new Map<string, Enrollment>();
  for (const enrollment of input.enrollments) {
    const externalId = input.enrollmentExternalIds?.get(enrollment.id);
    if (externalId) existingByExternalId.set(externalId, enrollment);
  }
  const activityIdOfProduction = new Map<string, number>();
  for (const production of input.productions) {
    if (production.registrationActivityId != null) {
      activityIdOfProduction.set(production.id, production.registrationActivityId);
    }
  }
  const activityIdOfClass = new Map<string, number>();
  for (const offering of input.classes) {
    if (offering.registrationActivityId != null) {
      activityIdOfClass.set(offering.id, offering.registrationActivityId);
    }
  }
  const targetOf = (enrollment: Enrollment): string =>
    enrollment.productionId ??
    enrollment.classId ??
    (enrollment.coachingActivityId != null ? `coaching:${enrollment.coachingActivityId}` : "");
  const withdrawn = new Set<string>();
  const retract = (
    external: RegistrationSnapshot["enrollments"][number],
    newTarget: string | undefined,
    newLabel: string
  ): void => {
    const old = existingByExternalId.get(external.externalId);
    if (!old || old.status === "withdrawn" || withdrawn.has(old.id)) return;
    const oldTarget = targetOf(old);
    if (newTarget) {
      if (oldTarget === newTarget) return;
    } else {
      const oldActivityId =
        (old.productionId ? activityIdOfProduction.get(old.productionId) : undefined) ??
        (old.classId ? activityIdOfClass.get(old.classId) : undefined);
      if (oldActivityId == null || external.offeringActivityId === oldActivityId) return;
    }
    withdrawn.add(old.id);
    plan.updates.push({ enrollmentId: old.id, status: "withdrawn" });
    plan.counts.enrollmentsUpdated += 1;
    plan.issues.push({
      kind: "conflict",
      externalId: external.externalId,
      message: `Registration ${external.externalId} used to be enrollment ${old.id} (${oldTarget}) and now points at ${newLabel}. The old enrollment was withdrawn; delete it once you have checked.`,
    });
  };

  /*
   * (student, target) pairs already planned as creates THIS run.
   *
   * existingByKey only guards against rows that were in the database before
   * the run started. With two sources feeding one snapshot (order_items and
   * legacy_enrollments), the same child can appear twice for the same show —
   * and both would pass the existing check, creating a duplicate enrollment.
   * First line item wins; the duplicate is skipped silently because it is the
   * same fact stated twice, not a problem a human needs to look at.
   */
  const plannedKeys = new Set<string>();

  /*
   * THE LEGACY SET IS A COUNT, NOT A TO-DO LIST.
   *
   * legacy_enrollments is the Sawyer and Regpack register as it stood at the
   * cutover: 727 orders, most of them completed 2026 summer programs, and
   * 526 of 816 rows with no activity_id at all, just Sawyer prose. Jason's
   * call (Aug 14 2026) was never to backfill them; they are accurate records
   * of what happened and matching them by text would invent rosters. A legacy
   * row that points at a CURRENT program resolves by activity id above, so a
   * legacy row that resolves to nothing is, by construction, one of these.
   *
   * Reporting each one as unknown_offering made every run "partial" with
   * 556 identical items and hid the real one. So they are rolled into a
   * single legacy_unmapped issue that names the programs and the count, and
   * that kind does not count toward "partial" (syncStatusFor). Withdrawal of
   * anything such a row placed earlier is unchanged.
   */
  const legacyUnmappedByName = new Map<string, number>();

  /*
   * A line item whose child the register itself does not know.
   *
   * The website snapshot keys a line item to a camper by name inside the
   * order's family, and when that family has no such camper it makes up a
   * participant id that no participant carries. Those used to fall through
   * "reported above" without ever being reported: two DC Unifieds comps sat
   * on no roster for weeks and no run ever said so. Now each such child is
   * named once.
   *
   * Website line items only. A Sawyer-era row whose child name matches no
   * camper is the same completed-program history the legacy bucket above
   * stands for (122 of them on the first run that looked, Sep 20 2026), not
   * a child a person can add to an account today.
   */
  const knownParticipants = new Set(snapshot.participants.map((p) => p.externalId));
  const orphanedParticipants = new Set<string>();

  for (const external of snapshot.enrollments) {
    const studentId = studentByParticipantId.get(external.participantExternalId);
    if (!studentId) {
      if (
        !external.externalId.startsWith("legacy:") &&
        !knownParticipants.has(external.participantExternalId) &&
        !orphanedParticipants.has(external.participantExternalId)
      ) {
        orphanedParticipants.add(external.participantExternalId);
        plan.issues.push({
          kind: "unmatched_participant",
          externalId: external.externalId,
          message: `Line item ${external.externalId} ("${external.offeringName}") names a child the registration system has no camper record for under that account. Add the camper to the order's family in the registration system, or move the order to the family that has them.`,
        });
      }
      continue; // otherwise reported above
    }

    const offeringKey = normalize(external.offeringName);
    const activityId = external.offeringActivityId;

    /*
     * A LEGACY ROW CAN NEVER LAND ON A DAY CAMP.
     *
     * Every day camp went on sale in August 2026 and sells only through
     * order_items. A Sawyer-era row pointing at one is a mislink by
     * definition — it is how the Disney campers ended up on Oct 12 — so it
     * is reported, never placed, and anything it placed before is withdrawn.
     */
    if (external.externalId.startsWith("legacy:") && external.offeringKind === "day_camp") {
      plan.issues.push({
        kind: "unknown_offering",
        externalId: external.externalId,
        message: `"${external.offeringName}" is a day camp, and ${external.externalId} is a legacy (Sawyer-era) registration. Day camps went on sale in August 2026 and sell only through the website's order_items, so a legacy row pointing at one is a mislink. Nothing was placed; clear the row's activity_id in the registration system.`,
      });
      retract(external, undefined, "a day camp it cannot have been for");
      continue;
    }
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
      if (external.externalId.startsWith("legacy:")) {
        legacyUnmappedByName.set(
          external.offeringName,
          (legacyUnmappedByName.get(external.offeringName) ?? 0) + 1
        );
        retract(external, undefined, `nothing ("${external.offeringName}")`);
        continue;
      }
      plan.issues.push({
        kind: "unknown_offering",
        externalId: external.externalId,
        message:
          external.offeringCategory === "coaching"
            ? `"${external.offeringName}" is coaching, but the staff portal's coaching catalog doesn't list it. Add it there (staff_portal.coaching_service_menu) and it will map on the next sync.`
            : `"${external.offeringName}" doesn't match any production or class in the Parent Portal. Publish it from the staff portal (Offerings), or map it manually.`,
      });
      retract(external, undefined, `nothing ("${external.offeringName}")`);
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
    // The source moved this registration to another target: the old row is
    // withdrawn below and the new one is created or adopted as usual.
    retract(external, targetKey, targetKey);
    const existing = existingByKey.get(`${studentId}::${targetKey}`);

    if (!existing && plannedKeys.has(`${studentId}::${targetKey}`)) continue;

    // The external id is unique across enrollments (enrollments_external_idx on
    // external_source, external_id). If another row already holds this one, the
    // registration is on a different student than the source says. Creating
    // would throw 23505 on every run, which is exactly what it did: 192 times
    // in 24 hours through 18 Sep 2026 on legacy:778 and legacy:790, Kai
    // Stuermann's Sweeney Todd and Hadestown registrations, both sitting on
    // his sister Vanessa.
    //
    // Two shapes reach here, and the second is why this is not a one-off:
    //
    //   1. A sibling, from a Sawyer era row matched by name before the camper
    //      id was the join (the Stuermanns).
    //   2. One child entered twice, one student row keyed and one not. Making
    //      camper_id the join on 20 Sep 2026 pointed the resolver at the keyed
    //      row while the unkeyed row still held the line item, so three more
    //      registrations began failing every fifteen minutes from 3:30 PM ET
    //      that day: 9df1fd22, legacy:772 and legacy:699, all Ryan Rodgers.
    //
    // The insert can never win either way, and while it keeps failing the run
    // reports "partial" forever, so a real problem in the issue list has
    // nowhere to show. Say it instead, and name both children.
    const heldElsewhere = existingByExternalId.get(external.externalId);
    if (!existing && heldElsewhere && heldElsewhere.studentId !== studentId) {
      plan.issues.push(
        wrongChildIssue({
          externalId: external.externalId,
          offeringName: external.offeringName,
          studentId,
          shouldBe: input.students.find((s) => s.id === studentId),
          heldBy: input.students.find((s) => s.id === heldElsewhere.studentId),
          heldEnrollmentId: heldElsewhere.id,
          heldStudentId: heldElsewhere.studentId,
        })
      );
      continue;
    }

    if (!existing) {
      plannedKeys.add(`${studentId}::${targetKey}`);
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
    const wantsStamp =
      !input.enrollmentExternalIds?.get(existing.id) && Boolean(external.externalId);
    /*
     * ...unless another enrollment already holds that external id.
     *
     * Same unique index as the create path above, reached the other way. The
     * row exists, it is the right child's, and it has no line item yet, so
     * every run tried to stamp it and the index refused: 97 PATCH conflicts in
     * 24 hours on one enrollment, from 20 Sep 2026 at 3:30 PM ET, the first
     * sync run after the camper id join shipped.
     *
     * Ryan Rodgers is two student rows, one keyed and one not. The unkeyed row
     * holds the line item; the keyed row holds the enrollment the sync now
     * resolves to. Neither the create guard nor this one can decide which row
     * is the child, so both report and neither retries.
     *
     * Only the stamp is withheld. Balance, status, payment and category still
     * update, because the enrollment itself is not in doubt and a family's
     * balance should not go stale while a duplicate student row is sorted out.
     */
    const stampBlockedBy =
      wantsStamp && heldElsewhere && heldElsewhere.id !== existing.id
        ? heldElsewhere
        : undefined;
    const stampExternalId = wantsStamp && !stampBlockedBy;
    if (stampBlockedBy) {
      plan.issues.push(
        wrongChildIssue({
          externalId: external.externalId,
          offeringName: external.offeringName,
          studentId,
          shouldBe: input.students.find((s) => s.id === studentId),
          heldBy: input.students.find((s) => s.id === stampBlockedBy.studentId),
          heldEnrollmentId: stampBlockedBy.id,
          heldStudentId: stampBlockedBy.studentId,
          adoptedEnrollmentId: existing.id,
        })
      );
    }
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

  if (legacyUnmappedByName.size > 0) {
    const rows = [...legacyUnmappedByName.values()].reduce((sum, n) => sum + n, 0);
    const named = [...legacyUnmappedByName.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const shown = named.slice(0, 8).map(([name, n]) => `${name} (${n})`).join("; ");
    const more = named.length > 8 ? `; and ${named.length - 8} more` : "";
    plan.issues.push({
      kind: "legacy_unmapped",
      externalId: "legacy:*",
      count: rows,
      message: `${rows} Sawyer-era registration${rows === 1 ? "" : "s"} name ${named.length} program${named.length === 1 ? "" : "s"} the app does not carry: ${shown}${more}. These are completed programs kept for the record and are never mapped by hand (Aug 14 2026). Nothing to do unless a current program is on this list.`,
    });
  }

  return plan;
}
