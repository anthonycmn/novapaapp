import { describe, expect, it } from "vitest";
import { offeringTopics, pickRecipient } from "@/lib/api/messages/offering-topics";

/**
 * A parent's commonest question is not about the organisation — it is about
 * the specific room their child is in. "Is Ava's costume meant to come home
 * this weekend" is not a health question or a billing question; it is a
 * Sweeney question, and it belongs to whoever runs Sweeney.
 */

const person = (
  name: string,
  patch: Partial<{ role: string; recipientEmail: string; roleCount: number }> = {}
) => ({
  name,
  role: patch.role,
  recipientEmail: patch.recipientEmail ?? `${name.toLowerCase()}@novapa.org`,
  roleCount: patch.roleCount ?? 1,
});

describe("choosing who a show's message goes to", () => {
  it("prefers the director — they run the room", () => {
    const chosen = pickRecipient([
      person("ryyana", { role: "Costume Designer", roleCount: 3 }),
      person("dana", { role: "Director" }),
    ]);
    expect(chosen?.name).toBe("dana");
  });

  it("counts a combined title as directing", () => {
    const chosen = pickRecipient([
      person("ryyana", { role: "Vocal Director", roleCount: 3 }),
      person("colton", { role: "Technical Director" }),
    ]);
    // Both are directors; most-involved wins between them.
    expect(chosen?.name).toBe("ryyana");
  });

  it("falls back to the most-involved person when nobody directs", () => {
    const chosen = pickRecipient([
      person("colton", { role: "Scenic Designer", roleCount: 1 }),
      person("ryyana", { role: "Costume Designer", roleCount: 3 }),
    ]);
    expect(chosen?.name).toBe("ryyana");
  });

  it("skips anybody without an org address", () => {
    // Five of fifteen staff records carry a personal address, and none of
    // them belongs in a parent's To: field.
    const chosen = pickRecipient([
      person("freddy", { role: "Director", recipientEmail: "freddy@gmail.com" }),
      person("ryyana", { role: "Costume Designer" }),
    ]);
    expect(chosen?.name).toBe("ryyana");
  });

  it("returns nobody rather than somebody unreachable", () => {
    expect(
      pickRecipient([person("freddy", { recipientEmail: "freddy@gmail.com" })])
    ).toBeUndefined();
    expect(pickRecipient([])).toBeUndefined();
  });
});

describe("the topics a family sees for their own offerings", () => {
  const contact = (patch = {}) => ({
    offering: "Sweeney Todd - Teen Conservatory",
    category: "Your shows",
    routeId: "offering:/productions/prod-sweeney",
    staffId: "staff-dana",
    recipientName: "Dana Whitfield",
    recipientTitle: "Director",
    recipientEmail: "dana@novapa.org",
    studentNames: ["Ava"],
    sortOrder: 10,
    ...patch,
  });

  it("titles the topic with the show, as the family knows it", () => {
    const [topic] = offeringTopics([contact()]);
    expect(topic.topic).toBe("Sweeney Todd - Teen Conservatory");
    expect(topic.recipientName).toBe("Dana Whitfield");
    expect(topic.recipientEmail).toBe("dana@novapa.org");
  });

  it("names the child in the blurb, so two children read differently", () => {
    expect(offeringTopics([contact()])[0].blurb).toContain("Ava's rehearsals");
    expect(
      offeringTopics([contact({ studentNames: ["Ava", "Leo"] })])[0].blurb
    ).toContain("Ava and Leo's");
  });

  it("words a class differently from a show", () => {
    const [topic] = offeringTopics([
      contact({ category: "Your classes", routeId: "offering:/classes/cls-1" }),
    ]);
    expect(topic.blurb).toContain("class");
    expect(topic.blurb).not.toContain("rehearsals");
  });

  it("is never urgent — a class question is not an emergency", () => {
    // Dressing one as urgent trains families past the warning that matters.
    expect(offeringTopics([contact()])[0].priority).toBe("Standard");
  });

  it("leaves out an offering with nobody reachable on it", () => {
    expect(offeringTopics([contact({ recipientEmail: undefined })])).toEqual([]);
  });

  it("keeps shows above classes in the list", () => {
    const topics = offeringTopics([
      contact({ category: "Your classes", routeId: "offering:/classes/a", sortOrder: 20 }),
      contact(),
    ]);
    expect(topics.map((t) => t.sortOrder)).toEqual([20, 10]);
    // groupTopics sorts within a category; the order here is by sortOrder
    // once grouped, and shows carry the lower number.
    expect(topics.find((t) => t.category === "Your shows")?.sortOrder).toBeLessThan(
      topics.find((t) => t.category === "Your classes")!.sortOrder
    );
  });
});
