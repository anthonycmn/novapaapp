import { describe, expect, it } from "vitest";
import { STAFF_CONTACTS, STAFF_EMAIL_DOMAIN } from "@/config/contacts";

/**
 * The contact list is family-facing, so these are guard rails rather than
 * unit tests: they exist to stop a future edit putting a child, a parent or
 * somebody's personal inbox in front of 769 families.
 */
describe("family-facing staff contacts", () => {
  it("only ever lists org staff addresses", () => {
    for (const contact of STAFF_CONTACTS) {
      expect(
        contact.email.endsWith(STAFF_EMAIL_DOMAIN),
        `${contact.email} is not an ${STAFF_EMAIL_DOMAIN} address`
      ).toBe(true);
    }
  });

  it("never lists a personal-mail provider", () => {
    const consumer = /@(gmail|yahoo|hotmail|outlook|icloud|aol|proton)\./i;
    for (const contact of STAFF_CONTACTS) {
      expect(consumer.test(contact.email), `${contact.email} is personal mail`).toBe(false);
    }
  });

  it("tells a parent what each person is for", () => {
    // A bare list of names makes families guess, and a guessed allergy email
    // sits unread on the wrong desk.
    for (const contact of STAFF_CONTACTS) {
      expect(contact.forWhat.trim().length, `${contact.name} has no purpose line`)
        .toBeGreaterThan(20);
      expect(contact.title.trim().length, `${contact.name} has no title`).toBeGreaterThan(0);
      expect(contact.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate addresses", () => {
    const emails = STAFF_CONTACTS.map((c) => c.email.toLowerCase());
    expect(new Set(emails).size).toBe(emails.length);
  });

  /*
   * This test used to require colton@novapa.org — "the director" — and that
   * requirement WAS the bug. One show's director on a global list meant every
   * production in the portal printed Sweeney's creative team on its contact
   * card, so a Frozen KIDS parent was told to email the Sweeney vocal director
   * about their five-year-old's track.
   *
   * A show's own team now comes from production_staff, per show. What this list
   * holds is the standing desks, and that is what is pinned here.
   */
  it("is exactly the five who answer for any show", () => {
    // CJ, 4 Sep 2026: "always include Katie Rivers, Jason Jones, Jen Travis,
    // Todd Cimino-Johnson, and Tony Cimino-Johnson."
    expect(STAFF_CONTACTS.map((c) => c.email).sort()).toEqual([
      "cj@novapa.org",
      "jason@novapa.org",
      "jen@novapa.org",
      "katie@novapa.org",
      "todd@novapa.org",
    ]);
  });

  it("no longer carries one show's creative team", () => {
    const emails = STAFF_CONTACTS.map((c) => c.email);
    expect(emails).not.toContain("colton@novapa.org");
    expect(emails).not.toContain("ryyana@novapa.org");
  });
});
