import "server-only";
import { getProvider } from "@/lib/api";
import type { NewPerformer, PerformanceRepo, StudentRecord } from "./repo";
import { actProblem, countingPerformers, signupOpen, studentEligible } from "./rules";
import type {
  ActPerformer,
  PerformanceAct,
  PerformanceEvent,
  RehearsalAnswer,
  SubmitResult,
} from "./types";
import { DEFAULT_TERMS } from "./terms";

/**
 * In-memory Performance Events for the mock-mode preview.
 *
 * Imitates the database closely enough that the whole sign-up can be walked
 * without Supabase: submit runs the same rule list pe_submit_act() runs, the
 * invitation answer the same checks as pe_answer_invite(). Reads of students
 * and guardians go through the mock DataProvider as the demo super admin,
 * so they see exactly what the rest of the mock app sees.
 */

const READER = "user-tony";

type MockState = {
  events: PerformanceEvent[];
  acts: PerformanceAct[];
  lineup: Record<string, string[]>;
  files: Map<string, string>;
  notices: Array<{ email: string; title: string; body: string; url: string; at: string }>;
  paid: Set<string>;
};

const g = globalThis as typeof globalThis & { __novapaPerformance?: MockState };

function daysFromNow(days: number, hour = 19): string {
  const d = new Date(Date.now() + days * 86400_000);
  d.setUTCHours(hour + 4, 0, 0, 0); // EDT wall clock, close enough for a demo
  return d.toISOString();
}

function ymd(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
}

function seed(): MockState {
  const base = {
    audience: "all" as const,
    eligibleProductionIds: [] as string[],
    eligibleClassIds: [] as string[],
    actTypes: ["song", "dance", "acting", "instrumental", "variety", "other"] as PerformanceEvent["actTypes"],
    actFormats: ["solo", "duet", "trio", "small_group", "large_group"] as PerformanceEvent["actFormats"],
    reqVideo: "optional" as const,
    reqHeadshot: "optional" as const,
    reqTrack: "optional" as const,
    reqSheetMusic: "optional" as const,
    reqBio: "optional" as const,
    bioMaxChars: 400,
    selectionMode: "review" as const,
    allowGuests: false,
    feeCents: 0,
    termsBody: DEFAULT_TERMS,
    alertRecipients: ["cj@novapa.org"],
    status: "published" as const,
    publishedAt: daysFromNow(-3),
  };
  return {
    events: [
      {
        ...base,
        id: "pe-cabaret",
        title: "Winter Cabaret",
        subtitle: "An evening of songs, scenes and dances from our students",
        description:
          "Our first Winter Cabaret. Every student who signs up and is accepted performs one number on the main stage.\n\n## What to prepare\n- A song, dance, scene or instrumental piece under four minutes\n- A backing track, or ask for our accompanist\n\nCJ reviews every act and will be in touch about the running order.",
        startsAt: daysFromNow(40, 19),
        callAt: daysFromNow(40, 17),
        endsAt: daysFromNow(40, 21),
        venueName: "NOVAPA Studio Theatre",
        venueAddress: "14000 Sullyfield Cir, Chantilly, VA 20151",
        signupOpensAt: daysFromNow(-3),
        signupClosesAt: daysFromNow(12, 23),
        actTypes: ["song", "dance", "acting", "instrumental"],
        actFormats: ["solo", "duet", "trio", "small_group"],
        maxActs: 30,
        maxActsPerStudent: 2,
        maxMinutesPerAct: 4,
        maxPerformersPerAct: 8,
        rehearsals: [
          { id: "pe-cabaret-r1", onDate: ymd(33), startsAt: "17:00", endsAt: "19:00", place: "Studio B", required: true, notes: "Spacing, in running order" },
          { id: "pe-cabaret-r2", onDate: ymd(39), startsAt: "16:00", endsAt: "20:00", place: "Studio Theatre", required: false, notes: "Tech rehearsal, drop in for your number" },
        ],
      },
      {
        ...base,
        id: "pe-anniversary",
        title: "NOVAPA One-Year Anniversary Showcase",
        subtitle: "Celebrating our first year with the Frozen JR. company",
        description: "A showcase for the students of Frozen JR. Every act that signs up performs.",
        startsAt: daysFromNow(55, 18),
        callAt: daysFromNow(55, 16),
        endsAt: daysFromNow(55, 20),
        venueName: "Chantilly High School Auditorium",
        venueAddress: "4201 Stringfellow Rd, Chantilly, VA 20151",
        signupOpensAt: daysFromNow(-1),
        signupClosesAt: daysFromNow(20, 23),
        audience: "chosen",
        eligibleProductionIds: ["prod-frozen"],
        reqVideo: "required",
        reqHeadshot: "required",
        reqBio: "required",
        bioMaxChars: 300,
        selectionMode: "everyone",
        allowGuests: true,
        maxActsPerStudent: 1,
        maxMinutesPerAct: 5,
        rehearsals: [],
      },
      {
        ...base,
        id: "pe-fall-teaser",
        title: "Fall Open Mic",
        subtitle: "Sign-ups have closed",
        description: "Thanks to everyone who signed up.",
        startsAt: daysFromNow(6, 18),
        endsAt: daysFromNow(6, 20),
        venueName: "NOVAPA Studio Theatre",
        signupOpensAt: daysFromNow(-20),
        signupClosesAt: daysFromNow(-1),
        status: "published",
        rehearsals: [],
      },
    ],
    acts: [],
    lineup: {},
    files: new Map(),
    notices: [],
    paid: new Set(),
  };
}

export function mockState(): MockState {
  return (g.__novapaPerformance ??= seed());
}

/** Mock only: move an event's deadline, so "the deadline passed" can be walked. */
export function mockSetSignupClose(eventId: string, iso: string): boolean {
  const e = mockState().events.find((x) => x.id === eventId);
  if (!e) return false;
  e.signupClosesAt = iso;
  return true;
}

export function mockReset(): void {
  g.__novapaPerformance = seed();
}

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const camel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function applyPatch<T extends object>(target: T, patch: Record<string, unknown>) {
  for (const [k, v] of Object.entries(patch)) {
    (target as Record<string, unknown>)[camel(k)] = v === null ? undefined : v;
  }
}

const clone = <T,>(v: T): T => structuredClone(v);

export class MockPerformanceRepo implements PerformanceRepo {
  readonly mode = "mock" as const;
  private get s() {
    return mockState();
  }

  async listVisibleEvents() {
    return clone(this.s.events.filter((e) => e.status !== "draft" && e.status !== "archived"));
  }
  async getEvent(id: string) {
    const e = this.s.events.find((x) => x.id === id);
    return e && e.status !== "draft" && e.status !== "archived" ? clone(e) : null;
  }
  async getAct(id: string) {
    const a = this.s.acts.find((x) => x.id === id);
    return a ? clone(a) : null;
  }
  async listActsForEvent(eventId: string) {
    return clone(this.s.acts.filter((a) => a.eventId === eventId));
  }
  async listActIdsForFamily(familyId: string, emails: string[]) {
    return this.s.acts
      .filter(
        (a) =>
          a.familyId === familyId ||
          a.performers.some(
            (p) =>
              p.familyId === familyId ||
              (p.kind === "invited" && p.inviteStatus === "pending" && p.inviteEmail && emails.includes(p.inviteEmail.toLowerCase()))
          )
      )
      .map((a) => a.id);
  }

  async insertAct(row: { eventId: string; familyId: string; submittedBy: string }) {
    const id = newId("act");
    this.s.acts.push({
      id,
      eventId: row.eventId,
      familyId: row.familyId,
      status: "draft",
      step: 0,
      contentOk: false,
      tech: {},
      feeCents: 0,
      feePaid: true,
      performers: [],
      rehearsals: [],
      updatedAt: new Date().toISOString(),
    });
    return id;
  }
  async updateAct(id: string, patch: Record<string, unknown>) {
    const a = this.s.acts.find((x) => x.id === id);
    if (!a) throw new Error("No such act");
    applyPatch(a, patch);
    a.updatedAt = new Date().toISOString();
  }
  async insertPerformer(row: NewPerformer) {
    const a = this.s.acts.find((x) => x.id === row.actId);
    if (!a) throw new Error("No such act");
    const id = newId("perf");
    const { actId: _actId, ...rest } = row;
    void _actId;
    a.performers.push({ ...(rest as Omit<ActPerformer, "id">), id });
    a.updatedAt = new Date().toISOString();
    return id;
  }
  private findPerformer(id: string) {
    for (const a of this.s.acts) {
      const p = a.performers.find((x) => x.id === id);
      if (p) return { a, p };
    }
    throw new Error("No such performer");
  }
  async updatePerformer(id: string, patch: Record<string, unknown>) {
    const { a, p } = this.findPerformer(id);
    applyPatch(p, patch);
    a.updatedAt = new Date().toISOString();
  }
  async deletePerformer(id: string) {
    const { a } = this.findPerformer(id);
    a.performers = a.performers.filter((p) => p.id !== id);
  }
  async setAvailability(actId: string, answers: RehearsalAnswer[]) {
    const a = this.s.acts.find((x) => x.id === actId);
    if (!a) throw new Error("No such act");
    a.rehearsals = answers;
  }
  async lineupSlots(eventId: string) {
    const e = this.s.events.find((x) => x.id === eventId);
    if (!e?.lineupPublishedAt) return {};
    return Object.fromEntries((this.s.lineup[eventId] ?? []).map((id, i) => [id, i + 1]));
  }

  async familyStudents(_actorId: string, familyId: string): Promise<StudentRecord[]> {
    const p = getProvider();
    const [students, enrollments, productions, classes] = await Promise.all([
      p.getStudentsForFamily(READER, familyId),
      p.getEnrollmentsForFamily(READER, familyId),
      p.getProductions(),
      p.getClasses(),
    ]);
    return students.map((s) => {
      const mine = enrollments.filter((e) => e.studentId === s.id && e.status === "enrolled");
      const productionIds = mine.map((e) => e.productionId).filter((x): x is string => Boolean(x));
      const classIds = mine.map((e) => e.classId).filter((x): x is string => Boolean(x));
      return {
        id: s.id,
        familyId: s.familyId,
        firstName: s.firstName,
        lastName: s.lastName,
        preferredName: s.preferredName,
        dateOfBirth: s.dateOfBirth,
        grade: s.grade,
        headshotUrl: s.headshotUrl,
        productionIds,
        classIds,
        enrolledIn: [
          ...productions.filter((x) => productionIds.includes(x.id)).map((x) => x.title),
          ...classes.filter((x) => classIds.includes(x.id)).map((x) => x.name),
        ],
      };
    });
  }
  async familyGuardians(_actorId: string, familyId: string) {
    const guardians = await getProvider().getGuardians(READER, familyId);
    return guardians.map((x) => ({ fullName: x.fullName, email: x.email, phone: x.phone, isPrimary: x.isPrimary }));
  }
  async familyName(familyId: string) {
    const f = await getProvider().getFamily(READER, familyId);
    return f?.name ?? "Another NOVAPA family";
  }

  async submit(actId: string, familyId: string, _actorId: string, termsMd5: string | undefined): Promise<SubmitResult> {
    const a = this.s.acts.find((x) => x.id === actId);
    if (!a || a.familyId !== familyId) return { ok: false, message: "That act is not yours to submit." };
    const e = this.s.events.find((x) => x.id === a.eventId)!;
    if (["accepted", "waitlisted", "declined", "withdrawn"].includes(a.status)) {
      return { ok: false, message: "This act has already been decided." };
    }
    if (!signupOpen(e) && a.status !== "needs_changes") return { ok: false, message: "Sign-ups for this event are closed." };

    const counts: Record<string, number> = {};
    for (const other of this.s.acts) {
      if (other.eventId !== e.id || other.id === a.id) continue;
      if (!["submitted", "needs_changes", "accepted", "waitlisted"].includes(other.status)) continue;
      for (const p of countingPerformers(other.performers)) if (p.studentId) counts[p.studentId] = (counts[p.studentId] ?? 0) + 1;
    }
    const eligible = new Set<string>();
    for (const p of a.performers) {
      if (!p.studentId || !p.familyId || p.inviteStatus !== "confirmed") continue;
      const st = (await this.familyStudents("", p.familyId)).find((x) => x.id === p.studentId);
      if (st && studentEligible(e, st)) eligible.add(st.id);
    }
    const problem = actProblem({ event: e, act: a, otherActsByStudent: counts, eligibleStudentIds: eligible, termsMd5 });
    if (problem) return { ok: false, message: problem };

    let next: PerformanceAct["status"] = "submitted";
    if (e.selectionMode === "everyone") {
      const taken = this.s.acts.filter((x) => x.eventId === e.id && x.status === "accepted" && x.id !== a.id).length;
      next = e.maxActs && taken >= e.maxActs ? "waitlisted" : "accepted";
    }
    const resubmitted = a.status === "needs_changes";
    a.status = next;
    a.submittedAt ??= new Date().toISOString();
    a.statusChangedAt = new Date().toISOString();
    if (resubmitted) a.familyNote = undefined;
    a.feeCents = e.feeCents;
    return { ok: true, status: next, resubmitted };
  }

  async withdraw(actId: string, familyId: string): Promise<SubmitResult> {
    const a = this.s.acts.find((x) => x.id === actId);
    if (!a || a.familyId !== familyId) return { ok: false, message: "That act is not yours to withdraw." };
    a.status = "withdrawn";
    a.statusChangedAt = new Date().toISOString();
    for (const k of Object.keys(this.s.lineup)) this.s.lineup[k] = this.s.lineup[k].filter((id) => id !== actId);
    return { ok: true };
  }

  async answerInvite(performerId: string, accept: boolean, studentId: string | undefined, familyId: string): Promise<SubmitResult> {
    let found: { a: PerformanceAct; p: ActPerformer } | undefined;
    try {
      found = this.findPerformer(performerId);
    } catch {
      return { ok: false, message: "That invitation is no longer open." };
    }
    const { a, p } = found;
    const guardians = await this.familyGuardians("", familyId);
    const emails = guardians.map((x) => x.email?.toLowerCase()).filter(Boolean);
    if (p.kind !== "invited" || p.inviteStatus !== "pending" || !p.inviteEmail || !emails.includes(p.inviteEmail.toLowerCase())) {
      return { ok: false, message: "That invitation is no longer open." };
    }
    if (!accept) {
      p.inviteStatus = "declined";
      p.familyId = familyId;
      return { ok: true, status: undefined };
    }
    const e = this.s.events.find((x) => x.id === a.eventId)!;
    const s = (await this.familyStudents("", familyId)).find((x) => x.id === studentId);
    if (!s) return { ok: false, message: "Choose one of your students." };
    if (a.performers.some((x) => x.studentId === s.id)) return { ok: false, message: "That student is already in this act." };
    if (!studentEligible(e, s)) return { ok: false, message: "That student is not eligible for this event." };
    if (e.maxActsPerStudent) {
      const n = this.s.acts.filter(
        (x) =>
          x.eventId === e.id &&
          !["withdrawn", "declined"].includes(x.status) &&
          countingPerformers(x.performers).some((y) => y.studentId === s.id)
      ).length;
      if (n >= e.maxActsPerStudent) {
        return { ok: false, message: `A student can be in ${e.maxActsPerStudent} act${e.maxActsPerStudent === 1 ? "" : "s"} in this event.` };
      }
    }
    const primary = guardians.find((x) => x.isPrimary) ?? guardians[0];
    Object.assign(p, {
      inviteStatus: "confirmed",
      confirmedAt: new Date().toISOString(),
      studentId: s.id,
      familyId,
      legalName: `${s.firstName} ${s.lastName}`,
      preferredName: s.preferredName,
      programName: p.programName ?? `${s.preferredName ?? s.firstName} ${s.lastName}`,
      gradeText: s.grade,
      guardianName: primary?.fullName,
      guardianEmail: primary?.email,
      guardianPhone: primary?.phone,
    });
    return { ok: true, status: undefined };
  }

  async notifyInvitedAddress(email: string, title: string, body: string, url: string) {
    this.s.notices.push({ email, title, body, url, at: new Date().toISOString() });
  }

  async storeDataUrl(path: string, dataUrl: string) {
    this.s.files.set(path, dataUrl);
    return path;
  }
  async copyStudentHeadshot(headshotUrl: string, path: string) {
    this.s.files.set(path, headshotUrl);
    return path;
  }
  async signUpload() {
    return null;
  }
  async signedUrls(paths: string[]) {
    return Object.fromEntries(paths.map((p) => [p, this.s.files.get(p) ?? ""]).filter(([, v]) => v));
  }

  async feeProductId(eventId: string) {
    return this.s.events.find((e) => e.id === eventId)?.feeCents ? `mock-fee-${eventId}` : undefined;
  }
  async paidActIds(actIds: string[]) {
    return new Set(actIds.filter((id) => this.s.paid.has(id)));
  }
}
