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

  it("includes the director and health & safety, who families need most", () => {
    const emails = STAFF_CONTACTS.map((c) => c.email);
    expect(emails).toContain("colton@novapa.org");
    expect(emails).toContain("katie@novapa.org");
  });
});
