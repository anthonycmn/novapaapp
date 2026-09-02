import { formatEventTime } from "@/lib/format";
import { org } from "@/config/org";
import {
  button,
  callout,
  esc,
  h2,
  p,
  renderEmailShell,
  section,
} from "@/lib/email/template";

/**
 * What a family and a coach are told when coaching is bought, booked or
 * called off.
 *
 * Pure on purpose — no `server-only` import, no network — because these are
 * the sentences NOVAPA is answerable for and they should be testable without
 * a database or a mail provider. `notify.ts` does the reading and the sending;
 * everything here is a value in and a message out.
 *
 * ---------------------------------------------------------------------------
 * THE FACTS ARRIVE ALREADY LOOKED UP
 * ---------------------------------------------------------------------------
 * Every figure in these messages comes from `staff_portal.coaching_session_
 * notice` and `coaching_purchase_notice` (portal 0211), read at the moment of
 * sending. Nothing is passed in from a form or carried across a redirect, so
 * "that leaves you two sessions" cannot be a number a stale tab believed.
 *
 * ---------------------------------------------------------------------------
 * TWO AUDIENCES, AND THEY ARE NOT THE SAME MESSAGE
 * ---------------------------------------------------------------------------
 * A family is being reassured: the thing you just did worked, here is when it
 * is, here is what is left. A coach is being STAFFED: somebody has taken an
 * hour of your week, and the only reason this email exists is that they might
 * not open the portal before it arrives. So the coach's message leads with the
 * time and the child, and never with a price — the coach's own rate and the
 * family's are different numbers, and 0211 deliberately carries neither.
 */

/** One session, exactly as `coaching_session_notice` returns it. */
export interface SessionNotice {
  sessionId: string;
  clientId: string;
  studentName: string;
  parentName: string | null;
  familyEmail: string | null;
  coachName: string | null;
  coachEmail: string | null;
  startsAt: string;
  durationMin: number;
  /**
   * The studio, when one has been set aside — and null nearly always, because
   * `family_book_coaching` takes a coach's hour without taking a room (portal
   * 0214). Null is a fact worth printing, not a field to leave out.
   */
  roomName: string | null;
  sessionType: string;
  status: string;
  cancelReason: string | null;
  sessionsLeft: number;
}

/** One purchase, exactly as `coaching_purchase_notice` returns it. */
export interface PurchaseNotice {
  reference: string;
  clientId: string | null;
  studentName: string | null;
  parentName: string | null;
  familyEmail: string | null;
  service: string;
  sessions: number;
  amountCents: number;
  status: string;
  sessionsLeft: number;
}

/** A rendered message, ready for the delivery adapter. */
export interface Message {
  subject: string;
  text: string;
  html: string;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * A number, or the fallback.
 *
 * Null is checked before Number() rather than after, because `Number(null)` is
 * 0 and 0 is finite — so a duration the database left null would sail through
 * as a zero-minute session rather than as a missing one.
 */
function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * A session notice, or null if it is not one.
 *
 * Null rather than a throw, and null rather than a half-filled object: the
 * caller's only sensible response to "the portal did not recognise that
 * session" is to send nothing, and a message about a booking with no time in
 * it is worse than silence.
 */
export function sessionNoticeFromRow(row: unknown): SessionNotice | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const sessionId = str(r.sessionId);
  const clientId = str(r.clientId);
  const startsAt = str(r.startsAt);
  const studentName = str(r.studentName);
  if (!sessionId || !clientId || !startsAt || !studentName) return null;

  return {
    sessionId,
    clientId,
    studentName,
    parentName: str(r.parentName),
    familyEmail: str(r.familyEmail),
    coachName: str(r.coachName),
    coachEmail: str(r.coachEmail),
    startsAt,
    durationMin: num(r.durationMin, 60),
    roomName: str(r.roomName),
    sessionType: str(r.sessionType) ?? "coaching",
    status: str(r.status) ?? "scheduled",
    cancelReason: str(r.cancelReason),
    sessionsLeft: Math.max(0, num(r.sessionsLeft)),
  };
}

/** A purchase notice, or null. Same rule as above. */
export function purchaseNoticeFromRow(row: unknown): PurchaseNotice | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const reference = str(r.reference);
  const service = str(r.service);
  const sessions = num(r.sessions);
  if (!reference || !service || sessions <= 0) return null;

  return {
    reference,
    clientId: str(r.clientId),
    studentName: str(r.studentName),
    parentName: str(r.parentName),
    familyEmail: str(r.familyEmail),
    service,
    sessions: Math.trunc(sessions),
    amountCents: Math.max(0, Math.round(num(r.amountCents))),
    status: str(r.status) ?? "pending",
    sessionsLeft: Math.max(0, num(r.sessionsLeft)),
  };
}

/**
 * "Hi Jennifer," or "Hello,".
 *
 * The same rule as the staff portal's coaching sends: a parent's first name if
 * we hold one, and nothing at all rather than the wrong one. The address on
 * file is usually the parent's, so greeting them by the child's name is the
 * mistake worth designing out.
 */
function greeting(parentName: string | null): string {
  const first = (parentName ?? "").trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : "Hello,";
}

/** "two sessions" up to ten, then numeric. Reads less like an invoice. */
export function sessionCount(n: number): string {
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const word = n >= 0 && n < words.length ? words[n] : String(n);
  return `${word} session${n === 1 ? "" : "s"}`;
}

/** "Sat, Mar 7 · 4:00 PM", in Leesburg time wherever the reader is. */
function when(startsAt: string): string {
  return formatEventTime(startsAt);
}

/**
 * What is left, said the way it should be acted on.
 *
 * Zero is not "you have no sessions" — it is the end of a package, and the
 * useful next sentence is about buying another rather than about the number.
 */
function balanceLine(sessionsLeft: number): string {
  if (sessionsLeft <= 0) {
    return "That uses the last session on the package. If you would like to carry on, you can buy another block in the portal any time.";
  }
  return `That leaves ${sessionCount(sessionsLeft)} on the package.`;
}

/**
 * Where it is, said honestly.
 *
 * A family's own booking takes the coach's hour and no studio (portal 0214),
 * so for now this is nearly always the second sentence. It is written rather
 * than omitted on purpose: a coach who reads "no room set aside" on Thursday
 * can go and get one, where a coach who reads nothing assumes it is handled.
 * The two audiences need different next steps, so they get different lines.
 */
function whereForCoach(roomName: string | null): string {
  return roomName
    ? roomName
    : "No room set aside yet — worth checking the diary if you need one.";
}

function whereForFamily(roomName: string | null): string {
  return roomName
    ? `You are in ${roomName}.`
    : "We will confirm the studio with you nearer the time.";
}

const signOff = `— ${org.shortName}`;

function shell(preheader: string, content: string): string {
  return renderEmailShell({ preheader, content });
}

/* -------------------------------------------------------------------------- */
/*  Booked                                                                     */
/* -------------------------------------------------------------------------- */

export function bookingForFamily(notice: SessionNotice, portalUrl: string): Message {
  const subject = `Coaching booked — ${notice.studentName}, ${when(notice.startsAt)}`;
  const coach = notice.coachName ? ` with ${notice.coachName}` : "";

  const content = [
    section(
      h2("Your coaching session is booked") +
        p(esc(greeting(notice.parentName))) +
        p(
          `${esc(notice.studentName)}'s ${esc(notice.sessionType.toLowerCase())} session${esc(coach)} is in the diary.`
        ),
      { first: true }
    ),
    section(
      callout(
        `<strong>${esc(when(notice.startsAt))}</strong><br>${notice.durationMin} minutes${
          notice.coachName ? ` · ${esc(notice.coachName)}` : ""
        }`
      )
    ),
    section(
      p(esc(whereForFamily(notice.roomName))) +
        p(esc(balanceLine(notice.sessionsLeft))) +
        p("Need to move it? You can cancel from the portal, or reply to this email and we will sort it out.") +
        button("Open the portal", portalUrl) +
        p(esc(signOff))
    ),
  ].join("");

  const text = [
    greeting(notice.parentName),
    "",
    `${notice.studentName}'s ${notice.sessionType.toLowerCase()} session${coach} is booked.`,
    `  ${when(notice.startsAt)} · ${notice.durationMin} minutes`,
    "",
    whereForFamily(notice.roomName),
    balanceLine(notice.sessionsLeft),
    "Need to move it? Cancel from the portal, or reply to this email.",
    portalUrl,
    "",
    signOff,
  ].join("\n");

  return { subject, text, html: shell(subject, content) };
}

/**
 * The coach's copy.
 *
 * Deliberately short and front-loaded: this is read on a phone, probably while
 * doing something else, and the two facts that matter are when and who. The
 * family's balance is included because a coach who knows this is the last of
 * ten says something different at the end of the hour.
 */
export function bookingForCoach(notice: SessionNotice, portalUrl: string): Message {
  const subject = `New coaching booking — ${notice.studentName}, ${when(notice.startsAt)}`;

  const content = [
    section(
      h2("A family has booked you") +
        p(
          `${esc(notice.studentName)} booked a ${notice.durationMin}-minute ${esc(
            notice.sessionType.toLowerCase()
          )} session with you in the parent portal.`
        ),
      { first: true }
    ),
    section(
      callout(
        `<strong>${esc(when(notice.startsAt))}</strong><br>${esc(notice.studentName)}<br>${esc(
          whereForCoach(notice.roomName)
        )}`
      )
    ),
    section(
      p(
        notice.sessionsLeft > 0
          ? `They have ${esc(sessionCount(notice.sessionsLeft))} left on their package after this one.`
          : "This is the last session on their package."
      ) +
        p("It is already in your diary — nothing to accept.") +
        button("Open my coaching", `${portalUrl}`) +
        p(esc(signOff))
    ),
  ].join("");

  const text = [
    `${notice.studentName} booked a ${notice.durationMin}-minute ${notice.sessionType.toLowerCase()} session with you.`,
    "",
    `  ${when(notice.startsAt)}`,
    `  ${whereForCoach(notice.roomName)}`,
    "",
    notice.sessionsLeft > 0
      ? `They have ${sessionCount(notice.sessionsLeft)} left on their package after this one.`
      : "This is the last session on their package.",
    "It is already in your diary — nothing to accept.",
    portalUrl,
    "",
    signOff,
  ].join("\n");

  return { subject, text, html: shell(subject, content) };
}

/* -------------------------------------------------------------------------- */
/*  Cancelled                                                                  */
/* -------------------------------------------------------------------------- */

export function cancellationForFamily(notice: SessionNotice, portalUrl: string): Message {
  const subject = `Coaching cancelled — ${notice.studentName}, ${when(notice.startsAt)}`;

  const content = [
    section(
      h2("That session is cancelled") +
        p(esc(greeting(notice.parentName))) +
        p(
          `${esc(notice.studentName)}'s session on <strong>${esc(when(notice.startsAt))}</strong> has been cancelled and the session has gone back on your package.`
        ),
      { first: true }
    ),
    section(
      callout(
        `<strong>${esc(sessionCount(notice.sessionsLeft))}</strong> now available to book`
      ) +
        p("Book another time whenever suits — the coach's open hours are in the portal.") +
        button("Book another session", portalUrl) +
        p(esc(signOff))
    ),
  ].join("");

  const text = [
    greeting(notice.parentName),
    "",
    `${notice.studentName}'s session on ${when(notice.startsAt)} is cancelled, and the session has gone back on your package.`,
    `You now have ${sessionCount(notice.sessionsLeft)} available to book.`,
    portalUrl,
    "",
    signOff,
  ].join("\n");

  return { subject, text, html: shell(subject, content) };
}

export function cancellationForCoach(notice: SessionNotice, portalUrl: string): Message {
  const subject = `Coaching cancelled — ${notice.studentName}, ${when(notice.startsAt)}`;

  const content = [
    section(
      h2("A booking has come off your diary") +
        p(
          `${esc(notice.studentName)}'s session on <strong>${esc(when(notice.startsAt))}</strong> was cancelled by the family in the parent portal.`
        ) +
        (notice.cancelReason ? p(esc(notice.cancelReason)) : "") +
        p("That hour is free again and open for anybody else to book.") +
        button("Open my coaching", portalUrl) +
        p(esc(signOff)),
      { first: true }
    ),
  ].join("");

  const text = [
    `${notice.studentName}'s session on ${when(notice.startsAt)} was cancelled by the family.`,
    notice.cancelReason ?? "",
    "That hour is free again.",
    portalUrl,
    "",
    signOff,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, text, html: shell(subject, content) };
}

/* -------------------------------------------------------------------------- */
/*  Bought                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The receipt.
 *
 * Sent for a payment the family has already made, which is why it goes out
 * whatever `do_not_email` says: that flag stops CJ's outreach, and a family
 * who has just been charged $1,050 is owed a note saying what for. The amount
 * is stated because a card statement four days later says "NOVAPA" and
 * nothing else.
 */
export function receiptForFamily(
  purchase: PurchaseNotice,
  portalUrl: string,
  amount: string
): Message {
  const subject = `Coaching sessions confirmed — ${purchase.service}`;
  const who = purchase.studentName ? ` for ${purchase.studentName}` : "";

  const content = [
    section(
      h2("Thank you — your coaching sessions are ready") +
        p(esc(greeting(purchase.parentName))) +
        p(
          `Your payment for <strong>${esc(purchase.service)}</strong>${esc(who)} has gone through, and ${esc(
            sessionCount(purchase.sessions)
          )} are now on the account and ready to book.`
        ),
      { first: true }
    ),
    section(
      callout(
        `<strong>${esc(sessionCount(purchase.sessionsLeft))}</strong> available to book<br>${esc(
          amount
        )} paid · reference ${esc(purchase.reference)}`
      )
    ),
    section(
      p(
        "Pick your times in the portal — you will see each coach's open hours and can book straight into them."
      ) +
        button("Book a session", portalUrl) +
        p("Keep this email for your records. Reply to it and it reaches us directly.") +
        p(esc(signOff))
    ),
  ].join("");

  const text = [
    greeting(purchase.parentName),
    "",
    `Your payment for ${purchase.service}${who} has gone through.`,
    `  ${sessionCount(purchase.sessions)} added · ${amount} paid`,
    `  Reference: ${purchase.reference}`,
    "",
    `You have ${sessionCount(purchase.sessionsLeft)} available to book.`,
    portalUrl,
    "",
    "Keep this email for your records. Reply to it and it reaches us directly.",
    signOff,
  ].join("\n");

  return { subject, text, html: shell(subject, content) };
}

/**
 * The office's copy.
 *
 * Plain text and no shell: this is an alert to a colleague, not a message to a
 * family, and it exists so that a package sold at nine on a Sunday evening is
 * known about before somebody opens the portal on Monday.
 */
export function saleForOffice(purchase: PurchaseNotice, amount: string): Message {
  const who = purchase.studentName ?? "a family";
  const subject = `Coaching sold — ${purchase.service} (${amount})`;
  const text = [
    `${who} bought ${purchase.service} in the parent portal.`,
    "",
    `  Sessions: ${purchase.sessions}`,
    `  Paid: ${amount}`,
    `  Reference: ${purchase.reference}`,
    `  Their balance now: ${purchase.sessionsLeft}`,
    "",
    "The sessions are on their account and bookable — nothing needed from you.",
  ].join("\n");

  return { subject, text, html: "" };
}
