import "server-only";
import { createHash } from "node:crypto";
import type { SessionUser } from "@/lib/api/types";
import { AccessDeniedError } from "@/lib/api/provider";
import { FEE_LINE_PREFIX, type PerformanceRepo, type StudentRecord } from "./repo";
import {
  actEditable,
  actProblem,
  ageOn,
  countingPerformers,
  formatCapacity,
  parseVideoLink,
  signupOpen,
  studentEligible,
} from "./rules";
import type {
  ActInvite,
  ActPatch,
  ActPerformer,
  FileKind,
  PerformanceAct,
  PerformanceEvent,
  PerformerCandidate,
  PerformerPatch,
  RehearsalAnswer,
  SubmitResult,
} from "./types";
import { ACT_FORMATS, ACT_TYPES } from "./types";

/**
 * Performance Events, the family's side (hub 0097).
 *
 * Every method takes the signed-in user and works out for itself what that
 * user's family may touch. Nothing the browser sends decides ownership,
 * prices, deadlines or caps. The two decisions that need a row lock (submit,
 * answer an invitation) are the database's, via the repository.
 */

const LIVE_ACT_STATUSES = new Set(["submitted", "needs_changes", "accepted", "waitlisted"]);

export function termsMd5(body: string | undefined): string | undefined {
  return body ? createHash("md5").update(body, "utf8").digest("hex") : undefined;
}

export interface EventCard {
  event: PerformanceEvent;
  eligibleStudentIds: string[];
  open: boolean;
  myActs: PerformanceAct[];
}

export interface EventPage extends EventCard {
  /** Acts other families submitted that include this family's student. */
  invitedActs: PerformanceAct[];
  invites: ActInvite[];
  candidates: PerformerCandidate[];
}

export interface ActPage {
  event: PerformanceEvent;
  act: PerformanceAct;
  /** True when the act belongs to the signed-in family. */
  mine: boolean;
  editable: boolean;
  candidates: PerformerCandidate[];
  /** First problem the database would raise on Submit, worked out ahead. */
  problem: string | null;
  termsMd5?: string;
}

export class PerformanceService {
  constructor(private readonly repo: PerformanceRepo) {}

  get mode() {
    return this.repo.mode;
  }

  /** An event as a family may see it: no staff alert addresses. */
  private async eventFor(id: string): Promise<PerformanceEvent | null> {
    const e = await this.repo.getEvent(id);
    return e ? redactEvent(e) : null;
  }

  /* ── reading ──────────────────────────────────────────────────────────── */

  private familyOf(user: SessionUser): string {
    if (!user.familyId) throw new AccessDeniedError("Only a family can sign up to perform.");
    return user.familyId;
  }

  private async familyEmails(user: SessionUser, familyId: string): Promise<string[]> {
    const guardians = await this.repo.familyGuardians(user.id, familyId);
    return [
      ...new Set(
        [user.email, ...guardians.map((g) => g.email)]
          .filter((e): e is string => Boolean(e))
          .map((e) => e.trim().toLowerCase())
      ),
    ];
  }

  private candidatesFor(event: PerformanceEvent, students: StudentRecord[], guardian?: { fullName: string; email?: string; phone?: string }): PerformerCandidate[] {
    return students.map((s) => {
      const age = ageOn(s.dateOfBirth, event.startsAt ? new Date(event.startsAt) : new Date());
      return {
        studentId: s.id,
        legalName: `${s.firstName} ${s.lastName}`.trim(),
        preferredName: s.preferredName && s.preferredName !== s.firstName ? s.preferredName : undefined,
        dateOfBirth: s.dateOfBirth,
        ageText: age !== undefined ? String(age) : undefined,
        gradeText: s.grade || undefined,
        headshotUrl: s.headshotUrl,
        enrolledIn: s.enrolledIn,
        eligible: studentEligible(event, s),
        guardianName: guardian?.fullName,
        guardianEmail: guardian?.email,
        guardianPhone: guardian?.phone,
      };
    });
  }

  private async decorate(acts: PerformanceAct[]): Promise<PerformanceAct[]> {
    if (!acts.length) return acts;
    const paths = acts.flatMap((a) => [
      a.trackPath,
      a.sheetMusicPath,
      ...a.performers.map((p) => p.headshotPath),
    ]).filter((p): p is string => Boolean(p));
    const [urls, paid] = await Promise.all([
      this.repo.signedUrls(paths),
      this.repo.paidActIds(acts.filter((a) => a.feeCents > 0).map((a) => a.id)),
    ]);
    const slotsByEvent = new Map<string, Record<string, number>>();
    for (const eventId of new Set(acts.map((a) => a.eventId))) {
      slotsByEvent.set(eventId, await this.repo.lineupSlots(eventId));
    }
    return acts.map((a) => ({
      ...a,
      trackUrl: a.trackPath ? urls[a.trackPath] : undefined,
      sheetMusicUrl: a.sheetMusicPath ? urls[a.sheetMusicPath] : undefined,
      feePaid: a.feeCents === 0 || paid.has(a.id),
      slot: slotsByEvent.get(a.eventId)?.[a.id],
      performers: a.performers.map((p) => ({
        ...p,
        headshotUrl: p.headshotPath ? urls[p.headshotPath] : undefined,
      })),
    }));
  }

  /**
   * What the family may see of an act that is not theirs: the act itself,
   * and of the other performers only their names. Never another family's
   * invite address, guardian contact or headshot.
   */
  private redactForInvitee(act: PerformanceAct, familyId: string): PerformanceAct {
    return {
      ...act,
      familyNote: undefined,
      videoUrl: act.videoUrl,
      performers: act.performers.map((p) =>
        p.familyId === familyId
          ? p
          : {
              id: p.id,
              kind: p.kind,
              inviteStatus: p.inviteStatus,
              programName: p.programName,
              preferredName: p.preferredName,
              legalName: p.inviteStatus === "confirmed" ? p.legalName : undefined,
              guestName: p.guestName,
              sort: p.sort,
            }
      ),
    };
  }

  /** Events this family can see on Home and /family/events. */
  async listEventsForFamily(user: SessionUser): Promise<EventCard[]> {
    const familyId = this.familyOf(user);
    const [events, students, emails] = await Promise.all([
      this.repo.listVisibleEvents().then((all) => all.map(redactEvent)),
      this.repo.familyStudents(user.id, familyId),
      this.familyEmails(user, familyId),
    ]);
    const actIds = new Set(await this.repo.listActIdsForFamily(familyId, emails));
    const cards: EventCard[] = [];
    for (const event of events) {
      const eligible = students.filter((s) => studentEligible(event, s)).map((s) => s.id);
      const all = await this.repo.listActsForEvent(event.id);
      const mine = all.filter((a) => a.familyId === familyId && a.status !== "withdrawn");
      const involved = all.some((a) => actIds.has(a.id));
      if (!eligible.length && !involved) continue;
      cards.push({ event, eligibleStudentIds: eligible, open: signupOpen(event), myActs: await this.decorate(mine) });
    }
    return cards.sort((a, b) => (a.event.startsAt ?? "").localeCompare(b.event.startsAt ?? ""));
  }

  async getEventPage(user: SessionUser, eventId: string): Promise<EventPage | null> {
    const familyId = this.familyOf(user);
    const event = await this.eventFor(eventId);
    if (!event) return null;
    const [students, guardians, emails] = await Promise.all([
      this.repo.familyStudents(user.id, familyId),
      this.repo.familyGuardians(user.id, familyId),
      this.familyEmails(user, familyId),
    ]);
    const actIds = new Set(await this.repo.listActIdsForFamily(familyId, emails));
    const all = await this.repo.listActsForEvent(eventId);
    const eligible = students.filter((s) => studentEligible(event, s)).map((s) => s.id);
    if (!eligible.length && !all.some((a) => actIds.has(a.id))) return null;

    const mine = all.filter((a) => a.familyId === familyId);
    const others = all.filter((a) => a.familyId !== familyId && actIds.has(a.id));
    const invites: ActInvite[] = [];
    for (const act of others) {
      for (const p of act.performers) {
        if (p.kind === "invited" && p.inviteStatus === "pending" && p.inviteEmail && emails.includes(p.inviteEmail.toLowerCase())) {
          invites.push({
            performerId: p.id,
            actId: act.id,
            eventId: event.id,
            eventTitle: event.title,
            actTitle: act.title,
            actType: act.actType,
            actFormat: act.actFormat,
            invitedByFamilyName: await this.repo.familyName(act.familyId),
          });
        }
      }
    }
    const confirmedIn = others.filter((a) => a.performers.some((p) => p.familyId === familyId && p.inviteStatus === "confirmed"));
    const primary = guardians.find((g) => g.isPrimary) ?? guardians[0];
    return {
      event,
      eligibleStudentIds: eligible,
      open: signupOpen(event),
      myActs: await this.decorate(mine),
      invitedActs: (await this.decorate(confirmedIn)).map((a) => this.redactForInvitee(a, familyId)),
      invites,
      candidates: this.candidatesFor(event, students, primary),
    };
  }

  /** Every open invitation for this family, across events, for the Home card. */
  async getInvites(user: SessionUser): Promise<ActInvite[]> {
    const cards = await this.listEventsForFamily(user);
    const out: ActInvite[] = [];
    for (const card of cards) {
      const page = await this.getEventPage(user, card.event.id);
      if (page) out.push(...page.invites);
    }
    return out;
  }

  private async otherActsByStudent(event: PerformanceEvent, act: PerformanceAct): Promise<Record<string, number>> {
    const all = await this.repo.listActsForEvent(event.id);
    const counts: Record<string, number> = {};
    for (const other of all) {
      if (other.id === act.id || !LIVE_ACT_STATUSES.has(other.status)) continue;
      for (const p of countingPerformers(other.performers)) {
        if (p.studentId) counts[p.studentId] = (counts[p.studentId] ?? 0) + 1;
      }
    }
    return counts;
  }

  async getActPage(user: SessionUser, actId: string): Promise<ActPage | null> {
    const familyId = this.familyOf(user);
    const act = await this.repo.getAct(actId);
    if (!act) return null;
    const event = await this.eventFor(act.eventId);
    if (!event) return null;
    const mine = act.familyId === familyId;
    if (!mine) {
      const emails = await this.familyEmails(user, familyId);
      const ids = await this.repo.listActIdsForFamily(familyId, emails);
      if (!ids.includes(actId)) return null;
    }
    const [students, guardians] = await Promise.all([
      this.repo.familyStudents(user.id, familyId),
      this.repo.familyGuardians(user.id, familyId),
    ]);
    const [decorated] = await this.decorate([act]);
    const md5 = termsMd5(event.termsBody);
    const eligibleIds = new Set(await this.eligibleConfirmedStudents(event, act));
    const problem = actProblem({
      event,
      act: decorated,
      otherActsByStudent: await this.otherActsByStudent(event, act),
      eligibleStudentIds: eligibleIds,
      termsMd5: md5,
    });
    const primary = guardians.find((g) => g.isPrimary) ?? guardians[0];
    return {
      event,
      act: mine ? decorated : this.redactForInvitee(decorated, familyId),
      mine,
      editable: mine && actEditable(event, act),
      candidates: this.candidatesFor(event, students, primary),
      problem,
      termsMd5: md5,
    };
  }

  /** Eligibility of the confirmed students on an act, across families. */
  private async eligibleConfirmedStudents(event: PerformanceEvent, act: PerformanceAct): Promise<string[]> {
    const out: string[] = [];
    const byFamily = new Map<string, string[]>();
    for (const p of act.performers) {
      if (p.studentId && p.familyId && p.inviteStatus === "confirmed") {
        byFamily.set(p.familyId, [...(byFamily.get(p.familyId) ?? []), p.studentId]);
      }
    }
    for (const [familyId, ids] of byFamily) {
      // The service role reads any family's students; only the eligibility
      // answer leaves this function.
      const students = await this.repo.familyStudents("", familyId).catch(() => [] as StudentRecord[]);
      for (const s of students) if (ids.includes(s.id) && studentEligible(event, s)) out.push(s.id);
    }
    return out;
  }

  /* ── writing ──────────────────────────────────────────────────────────── */

  /** Load an act this family owns and may still change, or throw. */
  private async ownEditable(user: SessionUser, actId: string): Promise<{ act: PerformanceAct; event: PerformanceEvent; familyId: string }> {
    const familyId = this.familyOf(user);
    const act = await this.repo.getAct(actId);
    if (!act || act.familyId !== familyId) throw new AccessDeniedError("That act is not yours.");
    const event = await this.eventFor(act.eventId);
    if (!event) throw new Error("That event no longer exists.");
    if (!actEditable(event, act)) {
      throw new Error(
        act.status === "withdrawn"
          ? "This act was withdrawn."
          : act.status === "declined"
            ? "This act has been decided."
            : "Sign-ups for this event are closed, so the act can no longer change."
      );
    }
    return { act, event, familyId };
  }

  /** Start an act with one of the family's own students as the first performer. */
  async startAct(user: SessionUser, eventId: string, studentId: string, overrides: PerformerPatch = {}): Promise<string> {
    const familyId = this.familyOf(user);
    const event = await this.eventFor(eventId);
    if (!event) throw new Error("That event no longer exists.");
    if (!signupOpen(event)) throw new Error("Sign-ups for this event are not open.");
    const students = await this.repo.familyStudents(user.id, familyId);
    const student = students.find((s) => s.id === studentId);
    if (!student) throw new AccessDeniedError("Choose one of your own students.");
    if (!studentEligible(event, student)) throw new Error(`${student.preferredName ?? student.firstName} is not eligible for this event.`);
    await this.assertUnderCap(event, studentId, undefined);

    const guardians = await this.repo.familyGuardians(user.id, familyId);
    const primary = guardians.find((g) => g.isPrimary) ?? guardians[0];
    const actId = await this.repo.insertAct({ eventId, familyId, submittedBy: user.id });
    await this.repo.insertPerformer(this.ownPerformerRow(actId, event, student, primary, 0, overrides));
    await this.repo.updateAct(actId, { step: 1 });
    return actId;
  }

  private ownPerformerRow(
    actId: string,
    event: PerformanceEvent,
    s: StudentRecord,
    guardian: { fullName: string; email?: string; phone?: string } | undefined,
    sort: number,
    overrides: PerformerPatch
  ) {
    const age = ageOn(s.dateOfBirth, event.startsAt ? new Date(event.startsAt) : new Date());
    const preferred = s.preferredName && s.preferredName !== s.firstName ? s.preferredName : undefined;
    return {
      actId,
      kind: "own" as const,
      studentId: s.id,
      familyId: s.familyId,
      inviteStatus: "confirmed" as const,
      legalName: `${s.firstName} ${s.lastName}`.trim(),
      preferredName: preferred,
      ageText: age !== undefined ? String(age) : undefined,
      gradeText: s.grade || undefined,
      guardianName: guardian?.fullName,
      guardianEmail: guardian?.email,
      guardianPhone: guardian?.phone,
      programName: `${preferred ?? s.firstName} ${s.lastName}`.trim(),
      sort,
      ...clean(overrides),
    };
  }

  private async assertUnderCap(event: PerformanceEvent, studentId: string, exceptActId: string | undefined) {
    if (!event.maxActsPerStudent) return;
    const all = await this.repo.listActsForEvent(event.id);
    const n = all.filter(
      (a) =>
        a.id !== exceptActId &&
        a.status !== "withdrawn" &&
        a.status !== "declined" &&
        countingPerformers(a.performers).some((p) => p.studentId === studentId)
    ).length;
    if (n >= event.maxActsPerStudent) {
      throw new Error(
        `A student can be in ${event.maxActsPerStudent} act${event.maxActsPerStudent === 1 ? "" : "s"} in this event, and this one already is.`
      );
    }
  }

  async saveAct(user: SessionUser, actId: string, patch: ActPatch): Promise<void> {
    const { act, event } = await this.ownEditable(user, actId);
    const row: Record<string, unknown> = {};
    if (patch.actType !== undefined) {
      if (patch.actType && (!ACT_TYPES.includes(patch.actType) || !event.actTypes.includes(patch.actType))) {
        throw new Error("This event does not take that kind of act.");
      }
      row.act_type = patch.actType || null;
    }
    if (patch.actFormat !== undefined) {
      if (patch.actFormat && (!ACT_FORMATS.includes(patch.actFormat) || !event.actFormats.includes(patch.actFormat))) {
        throw new Error("This event does not take that act format.");
      }
      row.act_format = patch.actFormat || null;
    }
    if (patch.title !== undefined) row.title = text(patch.title, 160);
    if (patch.source !== undefined) row.source = text(patch.source, 200);
    if (patch.characterName !== undefined) row.character_name = text(patch.characterName, 120);
    if (patch.description !== undefined) row.description = text(patch.description, 600);
    if (patch.keyTempoNotes !== undefined) row.key_tempo_notes = text(patch.keyTempoNotes, 300);
    if (patch.contentOk !== undefined) row.content_ok = Boolean(patch.contentOk);
    if (patch.runtimeSeconds !== undefined) {
      const s = patch.runtimeSeconds;
      if (s !== null && s !== undefined && (!Number.isInteger(s) || s < 1 || s > 7200)) {
        throw new Error("Give the running time in minutes and seconds.");
      }
      if (s && event.maxMinutesPerAct && s > event.maxMinutesPerAct * 60) {
        throw new Error(`Acts can run ${event.maxMinutesPerAct} minutes at most.`);
      }
      row.runtime_seconds = s ?? null;
    }
    if (patch.videoUrl !== undefined) {
      if (event.reqVideo === "off") row.video_url = null;
      else if (!patch.videoUrl) row.video_url = null;
      else {
        const parsed = parseVideoLink(patch.videoUrl);
        if (!parsed.ok) throw new Error(parsed.message);
        row.video_url = parsed.url;
      }
    }
    if (patch.trackMode !== undefined) {
      if (patch.trackMode && !["upload", "accompanist", "a_cappella", "own"].includes(patch.trackMode)) {
        throw new Error("Choose how the music is handled.");
      }
      row.track_mode = event.reqTrack === "off" ? null : patch.trackMode || null;
    }
    if (patch.tech !== undefined) row.tech = cleanTech(patch.tech);
    if (patch.step !== undefined) row.step = Math.max(act.step, Math.min(10, Math.max(0, Math.floor(patch.step))));
    if (Object.keys(row).length) await this.repo.updateAct(actId, row);
  }

  async addOwnPerformer(user: SessionUser, actId: string, studentId: string): Promise<void> {
    const { act, event, familyId } = await this.ownEditable(user, actId);
    if (act.performers.some((p) => p.studentId === studentId)) throw new Error("That student is already in this act.");
    this.assertRoom(event, act);
    const students = await this.repo.familyStudents(user.id, familyId);
    const student = students.find((s) => s.id === studentId);
    if (!student) throw new AccessDeniedError("Choose one of your own students.");
    if (!studentEligible(event, student)) throw new Error("That student is not eligible for this event.");
    await this.assertUnderCap(event, studentId, actId);
    const guardians = await this.repo.familyGuardians(user.id, familyId);
    const primary = guardians.find((g) => g.isPrimary) ?? guardians[0];
    await this.repo.insertPerformer(this.ownPerformerRow(actId, event, student, primary, act.performers.length, {}));
  }

  private assertRoom(event: PerformanceEvent, act: PerformanceAct) {
    const cap = formatCapacity(act.actFormat, event.maxPerformersPerAct);
    if (countingPerformers(act.performers).length >= cap) {
      throw new Error(
        act.actFormat === "solo"
          ? "A solo has one performer. Change the format to add more."
          : "This act already has as many performers as its format allows."
      );
    }
  }

  /**
   * Invite another NOVAPA family by a parent's email. The answer is the same
   * whether or not the address belongs to anyone: "invitation sent". The
   * family that holds it sees the request in their own Parent Portal.
   */
  async inviteFamily(user: SessionUser, actId: string, rawEmail: string): Promise<void> {
    const { act, event } = await this.ownEditable(user, actId);
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter the other parent's email address.");
    const own = await this.familyEmails(user, this.familyOf(user));
    if (own.includes(email)) throw new Error("That is your own address. Add your own student instead.");
    if (act.performers.some((p) => p.inviteEmail?.toLowerCase() === email && p.inviteStatus === "pending")) {
      throw new Error("You already invited that address to this act.");
    }
    this.assertRoom(event, act);
    await this.repo.insertPerformer({
      actId,
      kind: "invited",
      inviteEmail: email,
      inviteStatus: "pending",
      invitedBy: user.id,
      sort: act.performers.length,
    } as never);
    const familyName = await this.repo.familyName(act.familyId);
    await this.repo.notifyInvitedAddress(
      email,
      `Invitation to perform: ${event.title}`.slice(0, 80),
      `${familyName} invited your student to perform with them${act.title ? ` in "${act.title}"` : ""}. Confirm or decline in the Parent Portal.`.slice(0, 300),
      `/family/events/${event.id}`
    );
  }

  async addGuest(
    user: SessionUser,
    actId: string,
    guest: { name: string; age?: number; guardianName?: string; guardianContact?: string }
  ): Promise<void> {
    const { act, event } = await this.ownEditable(user, actId);
    if (!event.allowGuests) throw new Error("This event does not take guest performers.");
    const name = guest.name.trim();
    if (!name) throw new Error("Give the guest's name.");
    if (guest.age !== undefined && (!Number.isInteger(guest.age) || guest.age < 0 || guest.age > 99)) {
      throw new Error("Give the guest's age in years.");
    }
    if (!guest.guardianContact?.trim() && (guest.age ?? 18) < 18) {
      throw new Error("Give a parent or guardian's phone or email for a guest under 18.");
    }
    this.assertRoom(event, act);
    await this.repo.insertPerformer({
      actId,
      kind: "guest",
      inviteStatus: "confirmed",
      guestName: name.slice(0, 120),
      guestAge: guest.age,
      guestGuardianName: guest.guardianName?.trim().slice(0, 120) || undefined,
      guestGuardianContact: guest.guardianContact?.trim().slice(0, 160) || undefined,
      programName: name.slice(0, 120),
      sort: act.performers.length,
    } as never);
  }

  async removePerformer(user: SessionUser, actId: string, performerId: string): Promise<void> {
    const { act } = await this.ownEditable(user, actId);
    const p = act.performers.find((x) => x.id === performerId);
    if (!p) throw new Error("That performer is not on this act.");
    if (countingPerformers(act.performers).length <= 1 && p.inviteStatus !== "declined") {
      throw new Error("An act needs at least one performer. Withdraw the act instead.");
    }
    await this.repo.deletePerformer(performerId);
  }

  /**
   * Event-only details for a performer. The submitting family edits its own
   * students and guests; an invited family edits only its own student.
   * Never written back to the student record.
   */
  async updatePerformer(user: SessionUser, actId: string, performerId: string, patch: PerformerPatch): Promise<void> {
    const { act, event } = await this.performerAccess(user, actId, performerId);
    const row: Record<string, unknown> = {};
    const map: Array<[keyof PerformerPatch, string, number]> = [
      ["legalName", "legal_name", 120],
      ["preferredName", "preferred_name", 80],
      ["ageText", "age_text", 10],
      ["gradeText", "grade_text", 20],
      ["guardianName", "guardian_name", 120],
      ["guardianEmail", "guardian_email", 160],
      ["guardianPhone", "guardian_phone", 40],
      ["pronunciation", "pronunciation", 160],
      ["programName", "program_name", 120],
    ];
    for (const [key, column, max] of map) {
      if (patch[key] !== undefined) row[column] = text(String(patch[key] ?? ""), max);
    }
    if (patch.bio !== undefined) {
      if (event.reqBio === "off") row.bio = null;
      else {
        const bio = (patch.bio ?? "").trim();
        if (bio.length > event.bioMaxChars) throw new Error(`Keep the bio to ${event.bioMaxChars} characters.`);
        row.bio = bio || null;
      }
    }
    void act;
    if (Object.keys(row).length) await this.repo.updatePerformer(performerId, row);
  }

  /** The family may edit this performer: theirs to submit, or theirs by invitation. */
  private async performerAccess(user: SessionUser, actId: string, performerId: string) {
    const familyId = this.familyOf(user);
    const act = await this.repo.getAct(actId);
    if (!act) throw new Error("That act no longer exists.");
    const event = await this.eventFor(act.eventId);
    if (!event) throw new Error("That event no longer exists.");
    const p = act.performers.find((x) => x.id === performerId);
    if (!p) throw new Error("That performer is not on this act.");
    const mine = act.familyId === familyId && (p.kind !== "invited" || p.familyId === familyId);
    const invitedMine = p.kind === "invited" && p.familyId === familyId && p.inviteStatus === "confirmed";
    if (!mine && !invitedMine) throw new AccessDeniedError("That performer is another family's to edit.");
    if (!actEditable(event, act)) throw new Error("Sign-ups for this event are closed, so the act can no longer change.");
    return { act, event, performer: p, familyId };
  }

  async setRehearsals(user: SessionUser, actId: string, answers: RehearsalAnswer[]): Promise<void> {
    const { event } = await this.ownEditable(user, actId);
    const valid = answers
      .filter((a) => event.rehearsals.some((r) => r.id === a.rehearsalId))
      .map((a) => ({
        rehearsalId: a.rehearsalId,
        available: Boolean(a.available),
        conflictNote: a.available ? undefined : a.conflictNote?.trim().slice(0, 300) || undefined,
      }));
    await this.repo.setAvailability(actId, valid);
  }

  async acceptTerms(user: SessionUser, actId: string, accepted: boolean): Promise<void> {
    const { event } = await this.ownEditable(user, actId);
    await this.repo.updateAct(actId, accepted
      ? { terms_accepted_at: new Date().toISOString(), terms_md5: termsMd5(event.termsBody) ?? null }
      : { terms_accepted_at: null, terms_md5: null });
  }

  /* ── files ────────────────────────────────────────────────────────────── */

  /** Where a file for this act may be written. The prefix is the ownership check on the way back. */
  static folder(actId: string): string {
    return `acts/${actId}`;
  }

  async signFileUpload(user: SessionUser, actId: string, kind: FileKind, extension: string, performerId?: string) {
    if (kind === "headshot" && performerId) await this.performerAccess(user, actId, performerId);
    else await this.ownEditable(user, actId);
    const path = `${PerformanceService.folder(actId)}/${kind}${performerId ? `-${performerId.slice(0, 8)}` : ""}-${Date.now()}${extension}`;
    return this.repo.signUpload(path);
  }

  /**
   * Record a file against the act. Either the browser already wrote it to a
   * path this server issued (checked by prefix), or it is a small data URL
   * stored here (headshots, and every file in mock mode).
   */
  async attachFile(
    user: SessionUser,
    actId: string,
    kind: FileKind,
    source: { path: string } | { dataUrl: string; extension: string },
    fileName: string,
    performerId?: string
  ): Promise<void> {
    if (kind === "headshot") {
      if (!performerId) throw new Error("Whose headshot is this?");
      await this.performerAccess(user, actId, performerId);
    } else {
      const { event } = await this.ownEditable(user, actId);
      if (kind === "track" && event.reqTrack === "off") throw new Error("This event does not take backing tracks.");
      if (kind === "sheet_music" && event.reqSheetMusic === "off") throw new Error("This event does not take sheet music.");
    }
    const folder = PerformanceService.folder(actId);
    let path: string;
    if ("path" in source) {
      const p = source.path;
      if (!p.startsWith(`${folder}/${kind}`) || p.includes("..") || p.length > 300) {
        throw new AccessDeniedError("That upload does not belong to this act.");
      }
      path = p;
    } else {
      path = await this.repo.storeDataUrl(
        `${folder}/${kind}${performerId ? `-${performerId.slice(0, 8)}` : ""}-${Date.now()}${source.extension}`,
        source.dataUrl
      );
    }
    const name = fileName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").slice(0, 120) || kind;
    if (kind === "headshot") await this.repo.updatePerformer(performerId!, { headshot_path: path });
    else if (kind === "track") await this.repo.updateAct(actId, { track_path: path, track_filename: name, track_mode: "upload" });
    else await this.repo.updateAct(actId, { sheet_music_path: path, sheet_music_filename: name });
  }

  async clearFile(user: SessionUser, actId: string, kind: FileKind, performerId?: string): Promise<void> {
    if (kind === "headshot") {
      if (!performerId) return;
      await this.performerAccess(user, actId, performerId);
      await this.repo.updatePerformer(performerId, { headshot_path: null });
      return;
    }
    await this.ownEditable(user, actId);
    if (kind === "track") await this.repo.updateAct(actId, { track_path: null, track_filename: null });
    else await this.repo.updateAct(actId, { sheet_music_path: null, sheet_music_filename: null });
  }

  /** "Use the photo we have": copies the student's portal headshot into the act. */
  async useStudentHeadshot(user: SessionUser, actId: string, performerId: string): Promise<boolean> {
    const { performer, familyId } = await this.performerAccess(user, actId, performerId);
    if (!performer.studentId) return false;
    const students = await this.repo.familyStudents(user.id, familyId);
    const s = students.find((x) => x.id === performer.studentId);
    if (!s?.headshotUrl) return false;
    const path = await this.repo.copyStudentHeadshot(
      s.headshotUrl,
      `${PerformanceService.folder(actId)}/headshot-${performerId.slice(0, 8)}-${Date.now()}.jpg`
    );
    if (!path) return false;
    await this.repo.updatePerformer(performerId, { headshot_path: path });
    return true;
  }

  /* ── submit, withdraw, invitations ───────────────────────────────────── */

  async submit(user: SessionUser, actId: string): Promise<SubmitResult & { act?: PerformanceAct; event?: PerformanceEvent }> {
    const familyId = this.familyOf(user);
    const act = await this.repo.getAct(actId);
    if (!act || act.familyId !== familyId) return { ok: false, message: "That act is not yours to submit." };
    // Unredacted: the caller needs alertRecipients for the staff alert.
    const event = await this.repo.getEvent(act.eventId);
    if (!event) return { ok: false, message: "That event no longer exists." };
    const result = await this.repo.submit(actId, familyId, user.id, termsMd5(event.termsBody));
    if (!result.ok) return result;
    const after = await this.repo.getAct(actId);
    // A second Submit on an act already in is "changes", whatever the database calls it.
    return { ...result, resubmitted: Boolean(result.resubmitted) || act.status !== "draft", act: after ?? undefined, event };
  }

  async withdraw(user: SessionUser, actId: string): Promise<SubmitResult> {
    return this.repo.withdraw(actId, this.familyOf(user));
  }

  async answerInvite(user: SessionUser, performerId: string, accept: boolean, studentId?: string): Promise<SubmitResult> {
    const familyId = this.familyOf(user);
    if (accept && !studentId) return { ok: false, message: "Choose which of your students is performing." };
    return this.repo.answerInvite(performerId, accept, studentId, familyId);
  }

  /** The cart line for a participation fee: the existing store checkout and receipts. */
  async feeCartLine(user: SessionUser, actId: string): Promise<{ productId: string; note: string; studentName: string } | null> {
    const familyId = this.familyOf(user);
    const act = await this.repo.getAct(actId);
    if (!act || act.familyId !== familyId || act.feeCents <= 0) return null;
    if ((await this.repo.paidActIds([actId])).has(actId)) return null;
    const productId = await this.repo.feeProductId(act.eventId);
    if (!productId) return null;
    const lead = act.performers.find((p) => p.kind === "own");
    return {
      productId,
      note: `${FEE_LINE_PREFIX}${actId}`,
      studentName: lead?.programName ?? lead?.legalName ?? "Performer",
    };
  }

  /** Accepted acts and required rehearsals, for the family's iCal feed. */
  async calendarFor(familyId: string): Promise<Array<{ id: string; title: string; startsAt: string; endsAt: string; callTime?: string; location: string; studentIds: string[]; type: "performance" | "rehearsal"; details?: string }>> {
    const events = await this.repo.listVisibleEvents();
    const out: Awaited<ReturnType<PerformanceService["calendarFor"]>> = [];
    for (const event of events) {
      const acts = (await this.repo.listActsForEvent(event.id)).filter(
        (a) => a.status === "accepted" && a.performers.some((p) => p.familyId === familyId && p.inviteStatus === "confirmed")
      );
      if (!acts.length || !event.startsAt) continue;
      const studentIds = [...new Set(acts.flatMap((a) => a.performers.filter((p) => p.familyId === familyId && p.studentId).map((p) => p.studentId!)))];
      const slots = await this.repo.lineupSlots(event.id);
      const where = [event.venueName, event.venueAddress].filter(Boolean).join(", ");
      out.push({
        id: `perf-${event.id}`,
        type: "performance",
        title: event.title,
        startsAt: event.callAt ?? event.startsAt,
        endsAt: event.endsAt ?? new Date(new Date(event.startsAt).getTime() + 2 * 3600_000).toISOString(),
        callTime: event.callAt,
        location: where,
        studentIds,
        details: acts
          .map((a) => `${a.title ?? "Act"}${slots[a.id] ? ` (number ${slots[a.id]} in the running order)` : ""}`)
          .join("\n"),
      });
      for (const r of event.rehearsals.filter((r) => r.required)) {
        const start = easternToUtc(r.onDate, r.startsAt ?? "09:00");
        const end = easternToUtc(r.onDate, r.endsAt ?? addHour(r.startsAt ?? "09:00"));
        out.push({
          id: `perf-${event.id}-reh-${r.id}`,
          type: "rehearsal",
          title: `${event.title}: rehearsal`,
          startsAt: start,
          endsAt: end,
          location: r.place ?? where,
          studentIds,
          details: r.notes,
        });
      }
    }
    return out;
  }
}

function redactEvent(e: PerformanceEvent): PerformanceEvent {
  return { ...e, alertRecipients: [] };
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

function text(value: string | undefined | null, max: number): string | null {
  const t = (value ?? "").trim();
  return t ? t.slice(0, max) : null;
}

function clean<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as Partial<T>;
}

function cleanTech(t: PerformanceAct["tech"]): PerformanceAct["tech"] {
  const micTypes = ["handheld", "headset", "stand", "none"];
  const int = (v: unknown, max: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= max ? n : undefined;
  };
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 400) : undefined);
  return clean({
    micType: micTypes.includes(String(t.micType)) ? t.micType : undefined,
    micCount: int(t.micCount, 20),
    props: s(t.props),
    setPieces: s(t.setPieces),
    chairs: int(t.chairs, 40),
    lighting: s(t.lighting),
    costumeChanges: s(t.costumeChanges),
    accessibility: s(t.accessibility),
  });
}

function addHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** A wall-clock time in New York on a date, as UTC ISO. */
export function easternToUtc(ymd: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  // Guess at UTC-5, then correct by what New York actually reads at that instant.
  const guess = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)), h + 5, m));
  const shown = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(guess);
  const [sh, sm] = shown.split(":").map(Number);
  const drift = (sh * 60 + sm) - (h * 60 + m);
  return new Date(guess.getTime() - drift * 60_000).toISOString();
}

export type { ActPerformer };
