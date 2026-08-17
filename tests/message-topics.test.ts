import { describe, expect, it } from "vitest";
import {
  coverageRoleFor,
  describeRecipient,
  groupTopics,
  priorityOf,
  topicFromRow,
} from "@/lib/api/messages/topics";

/**
 * A family picks a concern; the contact tree says whose it is. These are the
 * rules that turn one into the other — and the one that matters most is the
 * coverage role, because it decides whether a message about a child's
 * medication can be read by anybody other than the person named on it.
 */

/** A row exactly as staff_portal.v_family_contact_routes returns one. */
const row = (patch: Record<string, unknown> = {}) => ({
  route_id: "6b1f0d9a-0000-4000-8000-000000000001",
  category: "Families",
  topic: "Refund request",
  blurb: "Asking for money back for a session, a class or a ticket.",
  priority: "Standard",
  sort_order: 20,
  staff_id: "3de03810-d59d-4908-b9ca-5920bff32701",
  recipient_name: "Todd Cimino-Johnson",
  recipient_title: "Co-Founder, CFO & Director of People Operations & Compliance",
  recipient_email: "todd@novapa.org",
  ...patch,
});

describe("who covers a topic", () => {
  it("sends anything under Health & safety to the health cover", () => {
    expect(coverageRoleFor({ category: "Health & safety" })).toBe("health_safety");
    expect(coverageRoleFor({ category: "health & safety" })).toBe("health_safety");
  });

  it("follows the OWNER out of their category", () => {
    // "Drop-off, pick-up or transport" is Katie's, but the contact tree files
    // it under Camp operations. It is still hers, and she still needs to see it.
    expect(
      coverageRoleFor({
        category: "Camp operations",
        recipientTitle: "Director of Health & Safety",
      })
    ).toBe("health_safety");
    expect(
      coverageRoleFor({
        category: "Camp operations",
        recipientTitle: "Director of Health and Safety",
      })
    ).toBe("health_safety");
  });

  it("leaves everything else with the administrators", () => {
    expect(coverageRoleFor({ category: "Families" })).toBe("admin");
    expect(
      coverageRoleFor({
        category: "Finance & HR",
        recipientTitle: "Co-Founder, CFO & Director of People Operations & Compliance",
      })
    ).toBe("admin");
    expect(coverageRoleFor({})).toBe("admin");
  });
});

describe("reading a route row", () => {
  it("reads the real shape", () => {
    expect(topicFromRow(row())).toEqual({
      routeId: "6b1f0d9a-0000-4000-8000-000000000001",
      category: "Families",
      topic: "Refund request",
      blurb: "Asking for money back for a session, a class or a ticket.",
      priority: "Standard",
      sortOrder: 20,
      staffId: "3de03810-d59d-4908-b9ca-5920bff32701",
      recipientName: "Todd Cimino-Johnson",
      recipientTitle:
        "Co-Founder, CFO & Director of People Operations & Compliance",
      recipientEmail: "todd@novapa.org",
      recipientRole: "admin",
    });
  });

  it("refuses a topic that cannot deliver", () => {
    // Better an absent topic than one a parent presses Send into.
    expect(topicFromRow(row({ recipient_email: null }))).toBeNull();
    expect(topicFromRow(row({ recipient_email: "  " }))).toBeNull();
    expect(topicFromRow(row({ staff_id: null }))).toBeNull();
    expect(topicFromRow(row({ recipient_name: null }))).toBeNull();
    expect(topicFromRow(row({ topic: "" }))).toBeNull();
    expect(topicFromRow(row({ route_id: null }))).toBeNull();
  });

  it("survives a route with no title and no blurb", () => {
    const topic = topicFromRow(row({ recipient_title: null, blurb: null }));
    expect(topic?.recipientTitle).toBeUndefined();
    expect(topic?.blurb).toBeUndefined();
    expect(topic?.recipientRole).toBe("admin");
  });

  it("lower-cases the address it will send to", () => {
    expect(topicFromRow(row({ recipient_email: "Todd@NoVAPA.org" }))?.recipientEmail).toBe(
      "todd@novapa.org"
    );
  });

  it("reads the three priorities and nothing else", () => {
    expect(priorityOf("Immediate")).toBe("Immediate");
    expect(priorityOf("urgent")).toBe("Urgent");
    expect(priorityOf("Standard")).toBe("Standard");
    expect(priorityOf("whenever")).toBe("Standard");
    expect(priorityOf(null)).toBe("Standard");
  });
});

describe("how a recipient reads", () => {
  it("is the form Tony asked for", () => {
    expect(
      describeRecipient({
        recipientName: "Katie Rivers",
        recipientTitle: "Director of Health & Safety",
      })
    ).toBe("Katie Rivers, Director of Health & Safety");
    expect(
      describeRecipient({
        recipientName: "Jen Travis",
        recipientTitle: "Family Engagement Coordinator",
      })
    ).toBe("Jen Travis, Family Engagement Coordinator");
  });

  it("drops the comma rather than trailing it", () => {
    expect(describeRecipient({ recipientName: "Jen Travis" })).toBe("Jen Travis");
    expect(describeRecipient({ recipientName: "Jen Travis", recipientTitle: " " })).toBe(
      "Jen Travis"
    );
    expect(describeRecipient({})).toBe("");
  });
});

describe("the order a parent reads them in", () => {
  const topics = [
    topicFromRow(row({ topic: "Something else — I need help", sort_order: 99 }))!,
    topicFromRow(row({ topic: "Refund request", sort_order: 20 }))!,
    topicFromRow(
      row({ category: "Health & safety", topic: "An injury", sort_order: 1 })
    )!,
    topicFromRow(row({ topic: "Registration or signing up", sort_order: 10 }))!,
  ];

  it("groups by category and keeps the contact tree's order inside one", () => {
    const grouped = groupTopics(topics);
    expect(grouped.map((g) => g.category)).toEqual(["Families", "Health & safety"]);
    expect(grouped[0].topics.map((t) => t.topic)).toEqual([
      "Registration or signing up",
      "Refund request",
      // The catch-all sorts last because the contact tree says 99, not because
      // of where it happens to fall in the alphabet.
      "Something else — I need help",
    ]);
  });

  it("breaks a tie by name rather than by luck", () => {
    const tied = [
      topicFromRow(row({ topic: "Show tickets", sort_order: 5 }))!,
      topicFromRow(row({ topic: "Billing or a payment plan", sort_order: 5 }))!,
    ];
    expect(groupTopics(tied)[0].topics.map((t) => t.topic)).toEqual([
      "Billing or a payment plan",
      "Show tickets",
    ]);
  });
});
