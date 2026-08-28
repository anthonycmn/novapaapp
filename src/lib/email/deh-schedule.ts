/**
 * The Dear Evan Hansen updated-schedule email.
 *
 * Tony, 28 Aug 2026, from the production notebook: the schedule for the 23rd
 * through the 27th moved, and every family in the company needs the new one —
 * with one line said plainly enough that nobody misreads it:
 *
 *     **Students are not called until 5:30 PM.**
 *
 * That sentence is the whole reason this email exists. The times in the
 * notebook are the *production* windows — load-in, crew, staff, the building
 * itself — and a parent who reads "2:00 PM" as their child's call time drives
 * a teenager to the theater three and a half hours early. So the student call
 * is rendered first, in the gold band, before the schedule table, and then
 * repeated on every single row. Redundant on purpose.
 *
 * Why the schedule is a hand-entered constant and not a database read, unlike
 * `weekly-company.ts` next door: Dear Evan Hansen has **no** calendar events,
 * no show_roles and no casting rows in `family_hub` (checked 28 Aug 2026 — all
 * three return zero for production 24437b1f-e9a0-43e4-95e3-4febefe79ec0), and
 * the staff-portal production row is an empty shell. There is nothing to
 * intersect and nothing to personalize *from*, so the schedule lives here, in
 * one block, in the order it was written down. Once DEH is on the calendar
 * this file should be deleted and the weekly-company path used instead.
 *
 * Because it is hand-entered it is also the one thing here that can be wrong
 * in a way that matters. Change `DEH_SCHEDULE` and nowhere else.
 */
import { formatInTimeZone } from "date-fns-tz";
import { org } from "@/config/org";
import {
  callout,
  emailPalette as C,
  esc,
  h2,
  p,
  renderEmailShell,
  section,
} from "./template";

/** The one fact the email exists to carry. */
export const STUDENT_CALL = "5:30 PM";

export interface DehDay {
  /** YYYY-MM-DD, Eastern. */
  date: string;
  /** What the day is — "Load-in", "Rehearsal", "Performance". */
  what: string;
  /**
   * The production window from the notebook: when the *building* is working.
   * Never presented to a family as a call time.
   */
  window: string;
  /** When the student is actually called. */
  studentCall: string;
  /** Anything this row needs said alongside it. */
  note?: string;
}

/**
 * The updated schedule, as written in the notebook on 28 Aug 2026.
 *
 * The notebook gives a bare day number ("23rd" … "27th") with no month.
 * September 2026 is the only reading that works: the 23rd falls on a
 * Wednesday, which puts load-in midweek and the rest of the week after it.
 * August's 23rd is a Sunday and already past; October's is a Friday, which
 * would put load-in at the end of a week rather than the start.
 */
export const DEH_SCHEDULE: DehDay[] = [
  {
    date: "2026-09-23",
    what: "Load-in",
    window: "2:00 PM – 10:00 PM",
    studentCall: STUDENT_CALL,
    note: "The load-in crew starts at 2:00 PM. Students are not needed for it.",
  },
  {
    date: "2026-09-24",
    what: "Rehearsal",
    window: "2:00 PM – 10:00 PM",
    studentCall: STUDENT_CALL,
  },
  {
    date: "2026-09-25",
    what: "Rehearsal",
    window: "2:30 PM – 10:30 PM",
    studentCall: STUDENT_CALL,
  },
  {
    date: "2026-09-26",
    what: "Rehearsal",
    window: "1:30 PM – 10:30 PM",
    studentCall: STUDENT_CALL,
  },
  {
    date: "2026-09-27",
    what: "Rehearsal",
    window: "1:30 PM – 9:30 PM",
    studentCall: STUDENT_CALL,
  },
];

/** Who the email is about, and who it goes to. */
export interface DehRecipient {
  /** The name the email greets the family about. */
  studentName: string;
  /** Deduplicated addresses for this student's household. */
  to: string[];
  /** Guardian display names, where the portal knows them. */
  guardianNames: string[];
}

const TZ = org.timeZone;

/** Noon Eastern, so neither DST nor a UTC render can move the day. */
function noonEastern(date: string): Date {
  const month = Number(date.slice(5, 7));
  const offset = month >= 3 && month <= 10 ? "-04:00" : "-05:00";
  return new Date(`${date}T12:00:00${offset}`);
}

export function dayLabel(date: string): string {
  return formatInTimeZone(noonEastern(date), TZ, "EEEE, MMMM d");
}

/** "September 23 – 27", for the subject line and the band above the table. */
export function scheduleRange(days: DehDay[] = DEH_SCHEDULE): string {
  if (days.length === 0) return "";
  const from = formatInTimeZone(noonEastern(days[0].date), TZ, "MMMM d");
  if (days.length === 1) return from;
  const to = formatInTimeZone(noonEastern(days[days.length - 1].date), TZ, "d");
  return `${from} – ${to}`;
}

export function renderDehSubject(recipient: DehRecipient): string {
  return `Dear Evan Hansen — updated schedule for ${recipient.studentName} (students called ${STUDENT_CALL})`;
}

/**
 * One day, as a table row.
 *
 * The student call is set in gold at the top of the row and the production
 * window sits beside it in muted grey, deliberately subordinate — the visual
 * order matches the order a parent needs to read them in.
 */
function dayRow(day: DehDay): string {
  const note = day.note
    ? `<div class="muted" style="margin-top:6px;font:400 13px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.MUTED}">${esc(day.note)}</div>`
    : "";
  return `<tr><td class="rule" style="padding:12px 0;border-bottom:1px solid ${C.BORDER}">
    <div class="ink" style="font:700 14px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.NAVY}">
      ${esc(dayLabel(day.date))} &middot; ${esc(day.what)}
    </div>
    <div class="ink" style="margin-top:3px;font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.INK}">
      <strong style="color:${C.GOLD_TEXT}">Student call ${esc(day.studentCall)}</strong><span class="muted" style="color:${C.MUTED}"> &middot; production window ${esc(day.window)}</span>
    </div>
    ${note}
  </td></tr>`;
}

export interface DehMeta {
  /** Where a family signs in. */
  portalUrl: string;
  /** The venue, as families should read it. */
  venue: string;
}

export function renderDehBody(
  recipient: DehRecipient,
  meta: DehMeta,
  days: DehDay[] = DEH_SCHEDULE
): string {
  return [
    section(
      `
      <p class="muted" style="margin:0 0 4px;font:600 11px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.GOLD_TEXT};text-transform:uppercase;letter-spacing:1.1px">Dear Evan Hansen &middot; Triple Threat Teen Intensive</p>
      ${h2(`Updated schedule for ${recipient.studentName}`)}
      ${p(`The schedule for <strong>${esc(scheduleRange(days))}</strong> has changed. Here is the new one — please replace anything you had written down before this email.`)}
      ${callout(
        `<strong>Students are not called until ${esc(STUDENT_CALL)}.</strong> The earlier times below are the production windows — load-in, crew and staff. Your student does not need to be at ${esc(meta.venue)} before ${esc(STUDENT_CALL)} on any of these days.`
      )}
      <div class="muted" style="margin:14px 0 8px;font:600 11px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.MUTED};text-transform:uppercase;letter-spacing:1.1px">${esc(scheduleRange(days))}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
        ${days.map(dayRow).join("")}
      </table>
    `,
      { first: true }
    ),

    section(`
      ${h2("Where")}
      ${p(`${esc(meta.venue)}. Every day above is at the same place.`)}
    `),

    section(`
      ${h2("If something on this list does not work")}
      ${p(`Tell us early rather than on the day. Conflicts, absences and schedule questions go to <a href="mailto:zoe@novapa.org" style="color:${C.NAVY}">zoe@novapa.org</a>, and anything about your student's wellbeing in the building goes to <a href="mailto:katie@novapa.org" style="color:${C.NAVY}">katie@novapa.org</a>.`)}
      ${p(`For anything else at all, <a href="mailto:${esc(org.supportEmail)}" style="color:${C.NAVY}">${esc(org.supportEmail)}</a> reaches us any time.`)}
    `),

    section(`<div style="height:8px"></div>`),
  ].join("");
}

export function renderDehEmail(
  recipient: DehRecipient,
  meta: DehMeta,
  days: DehDay[] = DEH_SCHEDULE
): { subject: string; html: string } {
  return {
    subject: renderDehSubject(recipient),
    html: renderEmailShell({
      preheader: `Updated ${scheduleRange(days)} schedule — students are not called until ${STUDENT_CALL}.`,
      content: renderDehBody(recipient, meta, days),
      footerNote: `You are receiving this because ${esc(recipient.studentName)} is in the Dear Evan Hansen company.`,
    }),
  };
}
