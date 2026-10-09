import type {
  ActFormat,
  ActPerformer,
  PerformanceAct,
  PerformanceEvent,
  Requirement,
} from "./types";

/**
 * The rules an act must pass, in plain TypeScript.
 *
 * The database is the authority: family_hub.pe_act_problem() (hub 0097) runs
 * the same list under a row lock when a parent presses Submit, and its answer
 * is the one that counts. This copy exists so the parent hears about a
 * missing headshot on the step where they can fix it, and so the mock backend
 * behaves like the real one. Keep the two in the same order and wording.
 *
 * No server-only imports here: the wizard runs these in the browser.
 */

export const ORG_TIME_ZONE = "America/New_York";

/** How many performers each format means. */
export function formatFits(format: ActFormat, performers: number): boolean {
  switch (format) {
    case "solo":
      return performers === 1;
    case "duet":
      return performers === 2;
    case "trio":
      return performers === 3;
    case "small_group":
      return performers >= 4 && performers <= 8;
    case "large_group":
      return performers >= 9;
  }
}

/** The most performers a format can hold, for "add another" buttons. */
export function formatCapacity(format: ActFormat | undefined, eventMax?: number): number {
  const byFormat: Record<ActFormat, number> = {
    solo: 1,
    duet: 2,
    trio: 3,
    small_group: 8,
    large_group: 99,
  };
  const cap = format ? byFormat[format] : 99;
  return eventMax ? Math.min(cap, eventMax) : cap;
}

/** Performers that still count: a declined invite does not. */
export function countingPerformers(performers: ActPerformer[]): ActPerformer[] {
  return performers.filter((p) => p.inviteStatus !== "declined");
}

/** Is the event open for sign-ups right now? */
export function signupOpen(event: PerformanceEvent, now: Date = new Date()): boolean {
  if (event.status !== "published") return false;
  if (event.signupOpensAt && new Date(event.signupOpensAt) > now) return false;
  if (event.signupClosesAt && new Date(event.signupClosesAt) <= now) return false;
  return true;
}

/** Can the family still change this act? */
export function actEditable(
  event: PerformanceEvent,
  act: Pick<PerformanceAct, "status">,
  now: Date = new Date()
): boolean {
  if (act.status === "withdrawn" || act.status === "declined") return false;
  if (act.status === "needs_changes") return true;
  return signupOpen(event, now);
}

/** "5th", "5TH", "8th grade", "K", "Pre-K" -> -1..12. Mirrors pe_grade_number(). */
export function gradeNumber(grade: string | undefined | null): number | undefined {
  const text = (grade ?? "").trim().toLowerCase();
  if (!text) return undefined;
  if (text.startsWith("pre")) return -1;
  if (text === "k" || text === "kindergarten") return 0;
  const match = /^(\d{1,2})/.exec(text);
  if (!match) return undefined;
  const n = Number(match[1]);
  return n <= 12 ? n : undefined;
}

export function gradeLabel(n: number): string {
  if (n === -1) return "Pre-K";
  if (n === 0) return "K";
  const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

/** Whole years on a date. */
export function ageOn(dateOfBirth: string | undefined, on: Date): number | undefined {
  if (!dateOfBirth) return undefined;
  const dob = new Date(`${dateOfBirth.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(dob.getTime())) return undefined;
  let years = on.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < dob.getUTCMonth() ||
    (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) years -= 1;
  return years;
}

/**
 * Mirrors pe_student_eligible(). An unknown age or grade passes: the portal
 * cannot verify it, and CJ reviews the act anyway.
 */
export function studentEligible(
  event: PerformanceEvent,
  student: { dateOfBirth?: string; grade?: string; productionIds: string[]; classIds: string[] },
  now: Date = new Date()
): boolean {
  if (event.audience === "chosen") {
    const inList =
      student.productionIds.some((id) => event.eligibleProductionIds.includes(id)) ||
      student.classIds.some((id) => event.eligibleClassIds.includes(id));
    if (!inList) return false;
  }
  const age = ageOn(student.dateOfBirth, event.startsAt ? new Date(event.startsAt) : now);
  if (age !== undefined) {
    if (event.minAge !== undefined && age < event.minAge) return false;
    if (event.maxAge !== undefined && age > event.maxAge) return false;
  }
  const grade = gradeNumber(student.grade);
  if (grade !== undefined) {
    if (event.minGrade !== undefined && grade < event.minGrade) return false;
    if (event.maxGrade !== undefined && grade > event.maxGrade) return false;
  }
  return true;
}

/** "3:30", "3m30s", "3.5", "210s", "3" (minutes) -> seconds. */
export function parseRuntime(text: string): number | undefined {
  const value = text.trim().toLowerCase();
  if (!value) return undefined;
  let match = /^(\d{1,3}):([0-5]?\d)$/.exec(value);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  match = /^(\d{1,3})\s*m(?:in)?\s*(?:(\d{1,2})\s*s(?:ec)?)?$/.exec(value);
  if (match) return Number(match[1]) * 60 + Number(match[2] ?? 0);
  match = /^(\d{1,4})\s*s(?:ec)?$/.exec(value);
  if (match) return Number(match[1]);
  match = /^(\d{1,3}(?:\.\d+)?)$/.exec(value);
  if (match) return Math.round(Number(match[1]) * 60);
  return undefined;
}

export function formatRuntime(seconds: number | undefined): string {
  if (!seconds && seconds !== 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatMinutes(minutes: number): string {
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/* ── video links ─────────────────────────────────────────────────────────── */

export type VideoHost = "youtube" | "vimeo" | "drive" | "dropbox" | "other";

/**
 * Is this a link we can take? A real http(s) URL. The four hosts families use
 * get a preview; anything else is still accepted, just not embedded.
 */
export function parseVideoLink(raw: string): { ok: true; url: string; host: VideoHost; embedUrl?: string } | { ok: false; message: string } {
  const text = raw.trim();
  if (!text) return { ok: false, message: "Paste the link to the video." };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, message: "That does not look like a link." };
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) {
    return { ok: false, message: "That does not look like a link." };
  }
  const host = url.hostname.replace(/^www\.|^m\./, "").toLowerCase();
  const href = url.toString();

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return { ok: true, url: href, host: "youtube", embedUrl: id ? `https://www.youtube-nocookie.com/embed/${id}` : undefined };
  }
  if (host.endsWith("youtube.com")) {
    const id =
      url.searchParams.get("v") ??
      /^\/(?:shorts|embed|live)\/([^/?#]+)/.exec(url.pathname)?.[1] ??
      undefined;
    return { ok: true, url: href, host: "youtube", embedUrl: id ? `https://www.youtube-nocookie.com/embed/${id}` : undefined };
  }
  if (host.endsWith("vimeo.com")) {
    const id = /\/(\d{5,})/.exec(url.pathname)?.[1];
    return { ok: true, url: href, host: "vimeo", embedUrl: id ? `https://player.vimeo.com/video/${id}` : undefined };
  }
  if (host === "drive.google.com") {
    const id = /\/file\/d\/([^/]+)/.exec(url.pathname)?.[1] ?? url.searchParams.get("id") ?? undefined;
    return { ok: true, url: href, host: "drive", embedUrl: id ? `https://drive.google.com/file/d/${id}/preview` : undefined };
  }
  if (host.endsWith("dropbox.com")) {
    // A raw=1 link plays in a <video> element; there is no iframe player.
    const raw1 = new URL(href);
    raw1.searchParams.delete("dl");
    raw1.searchParams.set("raw", "1");
    return { ok: true, url: href, host: "dropbox", embedUrl: raw1.toString() };
  }
  return { ok: true, url: href, host: "other" };
}

/* ── the submission rules ─────────────────────────────────────────────────── */

export interface RuleContext {
  event: PerformanceEvent;
  act: PerformanceAct;
  /** Other live acts in this event, per student id: how many each is already in. */
  otherActsByStudent: Record<string, number>;
  /** Eligibility of each confirmed student performer. */
  eligibleStudentIds: Set<string>;
  /** md5 of the event's terms text, worked out by the caller. */
  termsMd5?: string;
}

function required(req: Requirement): boolean {
  return req === "required";
}

/**
 * The first problem as a sentence for the parent, or null when the act may
 * go in. Same order and wording as pe_act_problem().
 */
export function actProblem(ctx: RuleContext): string | null {
  const { event, act } = ctx;
  if (!act.actType || !event.actTypes.includes(act.actType)) {
    return "Choose one of the act types this event allows.";
  }
  if (!act.actFormat || !event.actFormats.includes(act.actFormat)) {
    return "Choose one of the act formats this event allows.";
  }
  if (!act.title?.trim()) return "Give the act a title.";
  if (!act.runtimeSeconds) return "Say how long the act runs.";
  if (event.maxMinutesPerAct && act.runtimeSeconds > event.maxMinutesPerAct * 60) {
    return `Acts can run ${formatMinutes(event.maxMinutesPerAct)} minutes at most.`;
  }
  if (!act.contentOk) return "Confirm the material is family-appropriate.";

  const counting = countingPerformers(act.performers);
  if (counting.length === 0) return "Add at least one performer.";
  if (event.maxPerformersPerAct && counting.length > event.maxPerformersPerAct) {
    return `This event allows ${event.maxPerformersPerAct} performers per act.`;
  }
  if (!formatFits(act.actFormat, counting.length)) {
    return "The number of performers does not match the act format.";
  }
  if (counting.some((p) => p.kind === "guest") && !event.allowGuests) {
    return "This event does not take guest performers.";
  }
  for (const p of counting) {
    if (p.studentId && p.inviteStatus === "confirmed" && !ctx.eligibleStudentIds.has(p.studentId)) {
      return "One of the performers is not eligible for this event.";
    }
  }
  if (event.maxActsPerStudent) {
    for (const p of counting) {
      if (p.studentId && (ctx.otherActsByStudent[p.studentId] ?? 0) >= event.maxActsPerStudent) {
        return `A student can be in ${event.maxActsPerStudent} act${event.maxActsPerStudent === 1 ? "" : "s"} in this event, and one of these performers already is.`;
      }
    }
  }

  if (required(event.reqVideo) && !act.videoUrl) return "Add a performance video link.";
  if (required(event.reqTrack) && (!act.trackMode || (act.trackMode === "upload" && !act.trackPath))) {
    return "Upload a backing track, or say how the music is handled.";
  }
  if (required(event.reqSheetMusic) && !act.sheetMusicPath) return "Upload the sheet music.";
  const ownOrGuest = act.performers.filter((p) => p.kind === "own" || p.kind === "guest");
  if (required(event.reqHeadshot) && ownOrGuest.some((p) => !p.headshotPath)) {
    return "Add a headshot for every performer.";
  }
  if (required(event.reqBio) && ownOrGuest.some((p) => !p.bio?.trim())) {
    return "Write a program bio for every performer.";
  }
  if (act.performers.some((p) => (p.bio ?? "").length > event.bioMaxChars)) {
    return `Program bios are ${event.bioMaxChars} characters at most.`;
  }

  const unanswered = event.rehearsals.filter((r) => {
    if (!r.required) return false;
    const answer = act.rehearsals.find((a) => a.rehearsalId === r.id);
    return !answer || (!answer.available && !answer.conflictNote?.trim());
  });
  if (unanswered.length) return "Answer every required rehearsal, and explain any conflict.";

  if (event.termsBody && (!act.termsAcceptedAt || act.termsMd5 !== ctx.termsMd5)) {
    return "Read and accept the terms.";
  }
  return null;
}

/* ── time, always Eastern ─────────────────────────────────────────────────── */

export function formatEastern(
  iso: string | undefined,
  style: "date" | "time" | "datetime" | "long" = "datetime"
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions =
    style === "date"
      ? { month: "short", day: "numeric", year: "numeric" }
      : style === "time"
        ? { hour: "numeric", minute: "2-digit" }
        : style === "long"
          ? { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
          : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  const text = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: ORG_TIME_ZONE }).format(d);
  return style === "date" ? text : `${text} ET`;
}

/** A date stored as YYYY-MM-DD, written out without shifting a day. */
export function formatPlainDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** "14:30" -> "2:30 PM". */
export function formatClock(hhmm: string | undefined): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return "";
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

/** "3 days, 4 hours left" style countdown. Null once it has passed. */
export function countdown(untilIso: string | undefined, now: Date = new Date()): string | null {
  if (!untilIso) return null;
  const ms = new Date(untilIso).getTime() - now.getTime();
  if (ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (days >= 1) return `${plural(days, "day")}, ${plural(hours, "hour")} left`;
  if (hours >= 1) return `${plural(hours, "hour")}, ${plural(mins, "minute")} left`;
  return `${plural(Math.max(mins, 1), "minute")} left`;
}

/** Display name for a performer: the program name, else preferred + last. */
export function performerName(p: ActPerformer): string {
  if (p.programName?.trim()) return p.programName.trim();
  if (p.kind === "guest") return p.guestName ?? "Guest";
  if (p.kind === "invited" && p.inviteStatus !== "confirmed") return "Invited performer";
  return p.preferredName?.trim() || p.legalName?.trim() || "Performer";
}

/** Steps of the sign-up wizard, in order. Steps whose fields are all Off are skipped. */
export const WIZARD_STEPS = [
  "performer",
  "act",
  "performers",
  "media",
  "tech",
  "program",
  "rehearsals",
  "review",
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export function stepsFor(event: PerformanceEvent): WizardStep[] {
  return WIZARD_STEPS.filter((step) => {
    if (step === "performers") {
      return event.actFormats.some((f) => f !== "solo");
    }
    // The program step always shows: pronunciation and the printed name are
    // always asked. Only the bio field inside it follows the toggle.
    if (step === "rehearsals") return event.rehearsals.length > 0;
    return true;
  });
}
