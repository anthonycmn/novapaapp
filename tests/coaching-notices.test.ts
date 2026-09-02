import { describe, expect, it } from "vitest";
import {
  bookingForCoach,
  bookingForFamily,
  cancellationForCoach,
  cancellationForFamily,
  purchaseNoticeFromRow,
  receiptForFamily,
  saleForOffice,
  sessionCount,
  sessionNoticeFromRow,
} from "@/lib/api/coaching/notices";

/**
 * The messages a family and a coach get when coaching moves.
 *
 * These are the first things this system says to somebody about money they
 * have spent and an hour they have committed to, so what is pinned here is
 * what would be embarrassing or harmful to get wrong:
 *
 *   · a message built from a row that is missing the time or the child is not
 *     sent at all, because "your session is booked" with no date in it is
 *     worse than silence;
 *   · the coach's copy carries no price, ever — a family's rate and a coach's
 *     share are different numbers and neither belongs in the other's inbox;
 *   · a balance of zero reads as the end of a package, not as "you have no
 *     sessions", because the useful next sentence is about buying more.
 */

const PORTAL = "https://portal.novapa.org/coaches";

/** A row exactly as staff_portal.coaching_session_notice returns one. */
const sessionRow = (patch: Record<string, unknown> = {}) => ({
  sessionId: "11111111-1111-1111-1111-111111111111",
  clientId: "22222222-2222-2222-2222-222222222222",
  studentName: "Aubry Travis",
  parentName: "Jennifer Travis",
  familyEmail: "jennifer@example.com",
  doNotEmail: false,
  coachName: "Colton Sorensen",
  coachEmail: "colton@novapa.org",
  // 4pm Eastern on a Saturday, stored UTC as the database returns it.
  startsAt: "2026-03-07T21:00:00+00:00",
  durationMin: 50,
  // Null is the realistic default: a family's booking takes the coach's hour
  // and no studio (portal 0214).
  roomName: null,
  sessionType: "Acting",
  status: "scheduled",
  cancelReason: null,
  notes: null,
  sessionsLeft: 3,
  ...patch,
});

/** A row exactly as staff_portal.coaching_purchase_notice returns one. */
const purchaseRow = (patch: Record<string, unknown> = {}) => ({
  reference: "COACH-41",
  clientId: "22222222-2222-2222-2222-222222222222",
  studentName: "Aubry Travis",
  parentName: "Jennifer Travis",
  familyEmail: "jennifer@example.com",
  doNotEmail: false,
  service: "10-Pack Acting Coaching Sessions",
  sessions: 10,
  amountCents: 105000,
  status: "paid",
  paidAt: "2026-03-01T14:00:00+00:00",
  sessionsLeft: 10,
  ...patch,
});

describe("sessionNoticeFromRow", () => {
  it("reads a session the portal recognised", () => {
    const notice = sessionNoticeFromRow(sessionRow());
    expect(notice).not.toBeNull();
    expect(notice?.studentName).toBe("Aubry Travis");
    expect(notice?.coachEmail).toBe("colton@novapa.org");
    expect(notice?.sessionsLeft).toBe(3);
  });

  it("refuses a row with no start time", () => {
    // A booking confirmation with no date in it is the one message that must
    // never go out. Null here is what stops it.
    expect(sessionNoticeFromRow(sessionRow({ startsAt: null }))).toBeNull();
  });

  it("refuses a row with no child on it", () => {
    expect(sessionNoticeFromRow(sessionRow({ studentName: "  " }))).toBeNull();
  });

  it("refuses whatever an unknown session id returns", () => {
    expect(sessionNoticeFromRow(null)).toBeNull();
    expect(sessionNoticeFromRow(undefined)).toBeNull();
    expect(sessionNoticeFromRow("no such session")).toBeNull();
  });

  it("survives a coach with no address on file", () => {
    // Common and not an error: the family is still told, the coach is not.
    const notice = sessionNoticeFromRow(sessionRow({ coachEmail: null }));
    expect(notice?.coachEmail).toBeNull();
    expect(notice?.familyEmail).toBe("jennifer@example.com");
  });

  it("defaults a missing duration rather than dropping the message", () => {
    expect(sessionNoticeFromRow(sessionRow({ durationMin: null }))?.durationMin).toBe(60);
  });

  it("never reports a negative balance", () => {
    expect(sessionNoticeFromRow(sessionRow({ sessionsLeft: -2 }))?.sessionsLeft).toBe(0);
  });
});

describe("purchaseNoticeFromRow", () => {
  it("reads a completed purchase", () => {
    const purchase = purchaseNoticeFromRow(purchaseRow());
    expect(purchase?.reference).toBe("COACH-41");
    expect(purchase?.amountCents).toBe(105000);
    expect(purchase?.sessions).toBe(10);
  });

  it("refuses a package that grants no sessions", () => {
    // 0154 will not sell one, so a receipt for one means something disagrees.
    expect(purchaseNoticeFromRow(purchaseRow({ sessions: 0 }))).toBeNull();
  });

  it("refuses a row with no reference", () => {
    expect(purchaseNoticeFromRow(purchaseRow({ reference: null }))).toBeNull();
  });
});

describe("sessionCount", () => {
  it("spells small numbers out and pluralises", () => {
    expect(sessionCount(1)).toBe("one session");
    expect(sessionCount(3)).toBe("three sessions");
    expect(sessionCount(0)).toBe("no sessions");
  });

  it("goes numeric past ten", () => {
    expect(sessionCount(12)).toBe("12 sessions");
  });
});

describe("the family's booking confirmation", () => {
  const notice = sessionNoticeFromRow(sessionRow())!;
  const message = bookingForFamily(notice, PORTAL);

  it("names the child and the time in the subject", () => {
    expect(message.subject).toContain("Aubry Travis");
    expect(message.subject).toContain("Mar 7");
  });

  it("gives the time in Leesburg time, not UTC", () => {
    // 21:00 UTC is 4pm Eastern. A parent reading 9pm would turn up for nothing.
    expect(message.text).toContain("4:00 PM");
    expect(message.html).toContain("4:00 PM");
  });

  it("says what is left on the package", () => {
    expect(message.text).toContain("three sessions on the package");
  });

  it("greets the parent, never the child", () => {
    expect(message.text.startsWith("Hi Jennifer,")).toBe(true);
  });

  it("says hello to a family whose parent we do not know", () => {
    const anonymous = sessionNoticeFromRow(sessionRow({ parentName: null }))!;
    expect(bookingForFamily(anonymous, PORTAL).text.startsWith("Hello,")).toBe(true);
  });

  it("treats an empty balance as the end of a package", () => {
    const last = sessionNoticeFromRow(sessionRow({ sessionsLeft: 0 }))!;
    const text = bookingForFamily(last, PORTAL).text;
    expect(text).toContain("last session on the package");
    expect(text).not.toContain("no sessions on the package");
  });
});

describe("the coach's copy", () => {
  const notice = sessionNoticeFromRow(sessionRow())!;
  const message = bookingForCoach(notice, PORTAL);

  it("leads with when and who", () => {
    expect(message.subject).toContain("Aubry Travis");
    expect(message.text).toContain("4:00 PM");
  });

  it("carries no money at all", () => {
    // 0211 does not return a rate and this must not invent one. A coach's
    // share and a family's price are different numbers; neither belongs here.
    expect(message.text).not.toContain("$");
    expect(message.html).not.toContain("$");
  });

  it("says the booking needs nothing from them", () => {
    expect(message.text).toContain("nothing to accept");
  });

  it("names the room when one has been set aside", () => {
    const inStudioC = sessionNoticeFromRow(sessionRow({ roomName: "Studio C" }))!;
    expect(bookingForCoach(inStudioC, PORTAL).text).toContain("Studio C");
  });

  it("says plainly when no room has been set aside", () => {
    // The common case, and the one worth writing out: a coach who reads
    // nothing assumes it is handled, and for a family's own booking it is not.
    expect(message.text).toContain("No room set aside yet");
  });
});

describe("where a family is told to go", () => {
  it("names the room when there is one", () => {
    const inStudioC = sessionNoticeFromRow(sessionRow({ roomName: "Studio C" }))!;
    expect(bookingForFamily(inStudioC, PORTAL).text).toContain("You are in Studio C.");
  });

  it("promises to confirm rather than inventing a venue", () => {
    const notice = sessionNoticeFromRow(sessionRow())!;
    expect(bookingForFamily(notice, PORTAL).text).toContain(
      "confirm the studio with you nearer the time"
    );
  });
});

describe("cancellations", () => {
  const cancelled = sessionNoticeFromRow(
    sessionRow({
      status: "cancelled",
      sessionsLeft: 4,
      cancelReason: "Cancelled by the family in the parent portal",
    })
  )!;

  it("tells the family the session went back on their package", () => {
    const message = cancellationForFamily(cancelled, PORTAL);
    expect(message.text).toContain("back on your package");
    expect(message.text).toContain("four sessions");
  });

  it("tells the coach the hour is free, and why", () => {
    const message = cancellationForCoach(cancelled, PORTAL);
    expect(message.text).toContain("free again");
    expect(message.text).toContain("Cancelled by the family in the parent portal");
    expect(message.text).not.toContain("$");
  });
});

describe("the receipt", () => {
  const purchase = purchaseNoticeFromRow(purchaseRow())!;
  const message = receiptForFamily(purchase, PORTAL, "$1050.00");

  it("states what was bought, what it cost and the reference", () => {
    // A card statement four days later says NOVAPA and nothing else, so this
    // is the only record of what the money was for.
    expect(message.text).toContain("10-Pack Acting Coaching Sessions");
    expect(message.text).toContain("$1050.00");
    expect(message.text).toContain("COACH-41");
  });

  it("says how many are bookable now", () => {
    expect(message.text).toContain("ten sessions available to book");
  });
});

describe("the office's alert", () => {
  const purchase = purchaseNoticeFromRow(purchaseRow())!;
  const message = saleForOffice(purchase, "$1050.00");

  it("is plain text, with no family-facing shell around it", () => {
    expect(message.html).toBe("");
    expect(message.text).toContain("bought 10-Pack Acting Coaching Sessions");
  });

  it("says nothing is needed from them", () => {
    expect(message.text).toContain("nothing needed from you");
  });
});
