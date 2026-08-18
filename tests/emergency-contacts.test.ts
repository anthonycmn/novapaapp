import { describe, expect, it } from "vitest";
import { parseEmergencyContacts } from "@/lib/family/emergency-contacts";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";
import { familyAlerts } from "@/lib/profile-completeness";

/**
 * The emergency contact a household could be told to add but never type.
 *
 * The profile review has always raised a red "An emergency contact" alert and
 * pointed it at /family/edit, which had no field for one — so a parent saved
 * everything on the page and the alert stayed red. These cover the rules that
 * decide what a save does, and that saving one actually clears the alert.
 */

let counter = 0;
const newId = () => `ec-new-${++counter}`;

const row = (patch: Partial<Parameters<typeof parseEmergencyContacts>[0][number]> = {}) => ({
  id: "",
  fullName: "Gran Delgado",
  phone: "555-0100",
  relationship: "Grandparent",
  ...patch,
});

describe("parsing the emergency contact rows", () => {
  it("keeps an existing contact's id across an edit", () => {
    const { contacts, errors } = parseEmergencyContacts(
      [row({ id: "ec-1", phone: "555-0199" })],
      newId
    );
    expect(errors).toEqual({});
    expect(contacts).toEqual([
      { id: "ec-1", fullName: "Gran Delgado", phone: "555-0199", relationship: "Grandparent" },
    ]);
  });

  it("gives a brand-new contact an id", () => {
    const { contacts } = parseEmergencyContacts([row()], () => "ec-fresh");
    expect(contacts[0].id).toBe("ec-fresh");
  });

  it("drops an untouched blank row rather than refusing the save", () => {
    // Somebody pressed "add another" and changed their mind. Their real
    // contact must still save.
    const { contacts, errors } = parseEmergencyContacts(
      [row(), { id: "", fullName: "  ", phone: "", relationship: "" }],
      newId
    );
    expect(errors).toEqual({});
    expect(contacts).toHaveLength(1);
  });

  it("refuses a half-filled row, and says which field on which row", () => {
    const { contacts, errors } = parseEmergencyContacts(
      [row(), row({ fullName: "Uncle Ray", phone: "" })],
      newId
    );
    expect(errors["ec-1-phone"]).toMatch(/phone number/i);
    // The good row is not saved behind the bad one's back.
    expect(contacts).toHaveLength(1);
    expect(contacts[0].fullName).toBe("Gran Delgado");
  });

  it("accepts a number that is not a US format", () => {
    // An extension, a work line, an international number — this is the number
    // somebody dials when a child is hurt, so it is stored as typed.
    const { errors } = parseEmergencyContacts([row({ phone: "01234 567 890" })], newId);
    expect(errors).toEqual({});
  });

  it("removes a contact by simply not sending its row", () => {
    const { contacts } = parseEmergencyContacts([], newId);
    expect(contacts).toEqual([]);
  });
});

describe("saving one clears the red alert", () => {
  it("persists through the provider and completes the profile", async () => {
    resetMockStore();
    const provider = new MockDataProvider();

    const guardians = await provider.getGuardians("user-sofia", "fam-martinez");
    await provider.updateFamily("user-sofia", "fam-martinez", { emergencyContacts: [] });

    const cleared = await provider.getFamily("user-sofia", "fam-martinez");
    expect(
      familyAlerts(cleared!, guardians).map((alert) => alert.label)
    ).toContain("An emergency contact");

    const { contacts } = parseEmergencyContacts([row()], newId);
    await provider.updateFamily("user-sofia", "fam-martinez", {
      emergencyContacts: contacts,
    });

    const after = await provider.getFamily("user-sofia", "fam-martinez");
    expect(after!.emergencyContacts).toHaveLength(1);
    expect(after!.emergencyContacts[0].fullName).toBe("Gran Delgado");
    expect(
      familyAlerts(after!, guardians).map((alert) => alert.label)
    ).not.toContain("An emergency contact");
  });
});
