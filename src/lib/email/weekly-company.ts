/**
 * The weekly Sweeney Todd company email, built one recipient at a time.
 *
 * Tony, 27 Aug 2026: "an individualized email to every single company member
 * … make sure that each child has their individualized schedule based on
 * their role."
 *
 * "Based on their role" is the whole point, and the data supports it exactly:
 * `calendar_events.role_ids` records who is called to each rehearsal, and
 * `casting_assignments` records which roles a student holds. Intersect the
 * two and a student sees the three calls that are theirs instead of the
 * eleven that belong to the company. Ronan holds Pirelli *and* Fogg, Leah
 * holds Bird Seller *and* Ensemble, so a student's roles are a set, not a
 * value — the intersection is a union across all of them.
 *
 * Two traps this file is careful about, both found in the live data:
 *
 *  1. **Casting is published in batches, and the batches overlap.** Sweeney
 *     has publishes on 18 Aug, 20 Aug and 27 Aug; most students appear in
 *     more than one, with `cast_group` reading "Ensemble" in the older rows
 *     and "Ensemble of London" in the newest. Taking every row would double a
 *     child's roles and, worse, resurrect a superseded one. Only the latest
 *     publish per student counts — see `latestPublishPerStudent`.
 *  2. **A called role need not be a cast role.** "Young Lucy" is called at
 *     four rehearsals and nobody is cast in it. Matching therefore runs from
 *     the student's roles outward, never from the event's roster inward.
 */
import { formatInTimeZone } from "date-fns-tz";
import { org } from "@/config/org";
import {
  button,
  callout,
  emailPalette as C,
  esc,
  h2,
  p,
  renderEmailShell,
  section,
} from "./template";

export interface CastRow {
  studentId: string;
  familyId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  characterName: string;
  rehearsalTrack: string | null;
  publishedAt: string;
}

export interface EventRow {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  calledNote: string | null;
  worksNote: string | null;
  roleIds: string[] | null;
}

export interface RoleRow {
  id: string;
  name: string;
}

/** What one student's email is built from. */
export interface StudentPacket {
  studentId: string;
  familyId: string;
  /** The name the child goes by — what the email greets them as. */
  displayName: string;
  legalName: string;
  roles: string[];
  rehearsalTracks: string[];
  calls: EventRow[];
  /** Called to nothing in the window — a real state, and it must be said plainly. */
  noCalls: boolean;
}

const TZ = org.timeZone;

/**
 * Collapse overlapping publishes to the newest one per student.
 * Ties keep every row, which is correct: one publish can legitimately give a
 * student two roles (Pirelli in Act I, Fogg in Act II).
 */
export function latestPublishPerStudent(rows: CastRow[]): CastRow[] {
  const newest = new Map<string, string>();
  for (const row of rows) {
    const seen = newest.get(row.studentId);
    if (!seen || row.publishedAt > seen) newest.set(row.studentId, row.publishedAt);
  }
  return rows.filter((row) => newest.get(row.studentId) === row.publishedAt);
}

/** The name a child is greeted by: the preferred name when it is a real one. */
export function greetingName(row: {
  firstName: string;
  lastName: string;
  preferredName: string | null;
}): string {
  const preferred = (row.preferredName ?? "").trim();
  // Some preferred names are stored as the full name ("Ronan Karhuse") and
  // some as an empty string. Neither should become the greeting verbatim.
  if (preferred && preferred !== `${row.firstName} ${row.lastName}`) return preferred;
  return row.firstName;
}

/** Build one packet per student: their roles, and only the calls that are theirs. */
export function buildPackets(
  cast: CastRow[],
  events: EventRow[],
  roles: RoleRow[]
): StudentPacket[] {
  const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));
  const current = latestPublishPerStudent(cast);

  const byStudent = new Map<string, CastRow[]>();
  for (const row of current) {
    const list = byStudent.get(row.studentId) ?? [];
    list.push(row);
    byStudent.set(row.studentId, list);
  }

  const packets: StudentPacket[] = [];
  for (const [studentId, rows] of byStudent) {
    const roleNames = [...new Set(rows.map((r) => r.characterName))];
    const myRoleIds = new Set(
      roleNames
        .map((name) => roleIdByName.get(name))
        .filter((id): id is string => Boolean(id))
    );
    const calls = events
      .filter((e) => (e.roleIds ?? []).some((id) => myRoleIds.has(id)))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

    packets.push({
      studentId,
      familyId: rows[0].familyId,
      displayName: greetingName(rows[0]),
      legalName: `${rows[0].firstName} ${rows[0].lastName}`,
      roles: roleNames,
      rehearsalTracks: [
        ...new Set(
          rows.map((r) => r.rehearsalTrack).filter((t): t is string => Boolean(t))
        ),
      ],
      calls,
      noCalls: calls.length === 0,
    });
  }
  return packets.sort((a, b) => a.legalName.localeCompare(b.legalName));
}

/* ── rendering ──────────────────────────────────────────────────────────── */

function dayLabel(iso: string): string {
  return formatInTimeZone(new Date(iso), TZ, "EEEE, MMMM d");
}

function timeRange(startIso: string, endIso: string | null): string {
  const start = formatInTimeZone(new Date(startIso), TZ, "h:mm a");
  if (!endIso) return start;
  return `${start} – ${formatInTimeZone(new Date(endIso), TZ, "h:mm a")}`;
}

/** Strip the parking sentence for the compact line under each call. */
function shortLocation(location: string | null): string {
  if (!location) return "";
  return location.split("—")[0].split(",").slice(0, 2).join(",").trim();
}

/**
 * One call, rendered as a row. `worksNote` is the single most useful field in
 * the whole email — it is what the room is actually working — so it is never
 * truncated, however long it runs.
 */
function callRow(event: EventRow): string {
  const works = event.worksNote
    ? `<div class="muted" style="margin-top:6px;font:400 13px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.MUTED}"><strong style="color:${C.GOLD_TEXT}">Working:</strong> ${esc(event.worksNote)}</div>`
    : "";
  const where = shortLocation(event.location);
  return `<tr><td class="rule" style="padding:12px 0;border-bottom:1px solid ${C.BORDER}">
    <div class="ink" style="font:700 14px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.NAVY}">
      ${esc(dayLabel(event.startsAt))} &middot; ${esc(timeRange(event.startsAt, event.endsAt))}
    </div>
    <div class="ink" style="margin-top:3px;font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.INK}">
      ${esc(event.title)}${where ? `<span class="muted" style="color:${C.MUTED}"> &middot; ${esc(where)}</span>` : ""}
    </div>
    ${works}
  </td></tr>`;
}

export interface WeekMeta {
  /** Inclusive first day of the week the email covers. */
  from: string;
  /** Inclusive last day. */
  to: string;
  /** Where a family signs in. */
  portalUrl: string;
  /** Deep link to this show's page in the portal. */
  productionUrl: string;
}

export function weekLabel(meta: WeekMeta): string {
  const from = formatInTimeZone(new Date(meta.from), TZ, "MMMM d");
  const to = formatInTimeZone(new Date(meta.to), TZ, "MMMM d");
  return `${from} – ${to}`;
}

export function renderSubject(packet: StudentPacket, meta: WeekMeta): string {
  return `Sweeney Todd this week (${weekLabel(meta)}) — ${packet.displayName}'s calls`;
}

/**
 * The body. Written to be read on a phone at a stoplight: the schedule is the
 * first thing after the greeting, and everything discursive sits below it.
 */
export function renderBody(packet: StudentPacket, meta: WeekMeta): string {
  const roleLine = packet.roles.map((r) => esc(r)).join(" &middot; ");
  const trackLine = packet.rehearsalTracks.length
    ? `<div class="muted" style="margin-top:4px;font:400 13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.MUTED}">Track: ${packet.rehearsalTracks.map(esc).join(" &middot; ")}</div>`
    : "";

  const schedule = packet.noCalls
    ? callout(
        `<strong>${esc(packet.displayName)} is not called this week.</strong> Nothing is wrong — this week's calls belong to other tracks. The next call will appear in the portal, and it is still a good week to spend with the tracks.`
      )
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
        ${packet.calls.map(callRow).join("")}
      </table>`;

  return [
    section(
      `
      <p class="muted" style="margin:0 0 4px;font:600 11px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.GOLD_TEXT};text-transform:uppercase;letter-spacing:1.1px">Sweeney Todd &middot; Teen Conservatory</p>
      ${h2(`This week for ${packet.displayName}`)}
      <div class="ink" style="font:400 15px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.INK}">
        <strong>${roleLine}</strong>
      </div>
      ${trackLine}
      <div class="muted" style="margin:14px 0 8px;font:600 11px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.MUTED};text-transform:uppercase;letter-spacing:1.1px">${esc(weekLabel(meta))}</div>
      ${schedule}
    `,
      { first: true }
    ),

    section(`
      ${h2("Come knowing your part")}
      ${p(`Everyone should arrive this week already solid on their own vocal line. Rehearsal time is not for learning it — we will use the room to <strong>refresh</strong> what you already know and, more importantly, to <strong>learn everybody else's part</strong>. Sondheim only works when you can hear the line next to yours coming, and that is the skill we are building this week.`)}
      ${p(`The practice tracks and click tracks are made for exactly this. Sing your line against them, then sing somebody else's.`)}
      ${button("Open the practice tracks", meta.productionUrl)}
    `),

    section(`
      ${h2("Confirm the spelling of the name")}
      ${p(`A notification with ${esc(packet.displayName)}'s role is waiting in the portal. Please open it and <strong>accept it if the name is spelled correctly</strong> — and if it is not, correct it right there. This spelling is the one that goes in the playbill, so it is worth thirty seconds now.`)}
      ${button("Confirm the name", meta.portalUrl)}
    `),

    section(`
      ${h2("Tell us what the portal is missing")}
      ${p(`You are the first families ever to use the parent portal, and what you notice is genuinely useful to us. <strong>By the end of this week</strong>, send us anything that is broken, confusing, or simply absent — a resource you wish were in there, a page you expected and could not find. We can make it happen. Reply to this email or write to <a href="mailto:${esc(org.supportEmail)}" style="color:${C.NAVY}">${esc(org.supportEmail)}</a>.`)}
    `),

    section(`
      ${h2("Tickets, photos, and getting the word out")}
      ${p(`<strong>Tickets go on sale after September 4.</strong> We will send the link the moment it is live.`)}
      ${p(`We are also starting to photograph the company and post them on our social channels. When you see your student, <strong>please share it</strong> — every share puts this production in front of people who would never otherwise hear about it, and this cast has earned that audience.`)}
      ${p(`And never hesitate to reach out. <a href="mailto:${esc(org.supportEmail)}" style="color:${C.NAVY}">${esc(org.supportEmail)}</a> reaches us any time.`)}
    `),

    section(`<div style="height:8px"></div>`),
  ].join("");
}

export function renderStudentEmail(
  packet: StudentPacket,
  meta: WeekMeta
): { subject: string; html: string } {
  const preheader = packet.noCalls
    ? `No calls for ${packet.displayName} this week — plus tracks, name confirmation, and ticket news.`
    : `${packet.calls.length} call${packet.calls.length === 1 ? "" : "s"} this week for ${packet.displayName}, starting ${dayLabel(packet.calls[0].startsAt)}.`;

  return {
    subject: renderSubject(packet, meta),
    html: renderEmailShell({
      preheader,
      content: renderBody(packet, meta),
      footerNote: `You are receiving this because ${esc(packet.legalName)} is in the Sweeney Todd company.`,
    }),
  };
}
