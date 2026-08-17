import { describe, expect, it } from "vitest";
import { askSpot, scoreAnswer, stem, tokenize } from "@/lib/spot/match";
import { SPOT_ANSWERS } from "@/lib/spot/knowledge";

/**
 * Spot is a lookup, not a language model — every answer is hand-written and
 * points at a real page. So the tests are about two things: does it find the
 * right page for the words a parent would actually use, and does it SHUT UP
 * when it does not know.
 *
 * The second matters more. A confident wrong answer about a child's medication
 * is the failure this whole design exists to prevent.
 */

const topAnswerFor = (query: string) => askSpot(query)[0]?.answer.id;

describe("finding the right page", () => {
  it.each([
    ["when is my child's next rehearsal", "schedule"],
    ["what time is pickup", "pickup"],
    ["how do I buy tickets", "tickets"],
    ["I need tickets for grandparents", "tickets"],
    ["my daughter is sick and will miss class", "absence"],
    ["how much do I owe", "payment"],
    ["I want a refund", "refund"],
    ["where is my dependent care statement", "fsa"],
    ["I need a receipt for my taxes", "fsa"],
    ["where do I upload the signed waiver", "documents"],
    ["my son has a nut allergy", "health-form"],
    ["I need to change my email address", "profile"],
    ["what role did my child get", "casting"],
    ["who is teaching the Tuesday class", "staff"],
    ["how do I sign up for summer camp", "register"],
    ["I want to order a spirit button", "store"],
    ["stop sending me so many notifications", "notifications"],
    ["how do I add this to my google calendar", "subscribe-calendar"],
  ])("%s → %s", (query, expected) => {
    expect(topAnswerFor(query)).toBe(expected);
  });
});

describe("the words parents actually use", () => {
  it("matches plurals against singular keywords", () => {
    expect(topAnswerFor("tickets")).toBe("tickets");
    expect(topAnswerFor("allergies")).toBe("health-form");
    expect(topAnswerFor("photos")).toBe("photos");
  });

  it("is not thrown by punctuation or capitals", () => {
    expect(topAnswerFor("REFUND!!!")).toBe("refund");
    expect(topAnswerFor("Where's my child's schedule?")).toBe("schedule");
  });

  it("ignores politeness rather than matching on it", () => {
    // "Hi, please, thanks" carry no signal and must not tip a match.
    expect(tokenize("hi please could you thanks")).toEqual([]);
  });

  it("weighs a phrase above the words in it", () => {
    // "call time" is a rehearsal thing; "call" alone could be a phone call.
    const schedule = SPOT_ANSWERS.find((a) => a.id === "schedule")!;
    expect(scoreAnswer("what is the call time", schedule)).toBeGreaterThan(
      scoreAnswer("call", schedule)
    );
  });
});

describe("knowing when it does not know", () => {
  it("says nothing to a question it has no page for", () => {
    expect(askSpot("what is the capital of France")).toEqual([]);
    expect(askSpot("do you have a swimming pool")).toEqual([]);
    expect(askSpot("asdfghjkl")).toEqual([]);
  });

  it("says nothing to an empty question", () => {
    expect(askSpot("")).toEqual([]);
    expect(askSpot("   ")).toEqual([]);
    expect(askSpot("hello there")).toEqual([]);
  });

  it("never returns a match below the floor", () => {
    for (const match of askSpot("my child")) {
      expect(match.score).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("being predictable", () => {
  it("gives the same answer to the same question every time", () => {
    const once = askSpot("how do I pay my balance").map((m) => m.answer.id);
    const twice = askSpot("how do I pay my balance").map((m) => m.answer.id);
    expect(once).toEqual(twice);
  });

  it("offers a few options rather than one, but not a wall", () => {
    expect(askSpot("class").length).toBeLessThanOrEqual(3);
  });
});

describe("stemming, just enough", () => {
  it("handles the endings that matter", () => {
    expect(stem("tickets")).toBe("ticket");
    expect(stem("allergies")).toBe("allergy");
    expect(stem("classes")).toBe("class");
    expect(stem("booking")).toBe("book");
  });

  it("leaves short words and double-s alone", () => {
    expect(stem("is")).toBe("is");
    expect(stem("class")).toBe("class");
    expect(stem("dress")).toBe("dress");
  });
});

describe("the knowledge base itself", () => {
  it("has no duplicate ids", () => {
    const ids = SPOT_ANSWERS.map((answer) => answer.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every answer somewhere to go", () => {
    for (const answer of SPOT_ANSWERS) {
      expect(answer.links.length, `${answer.id} has no links`).toBeGreaterThan(0);
      for (const link of answer.links) {
        // An internal link must be a real path, not a guess at one.
        if (!link.external) expect(link.href.startsWith("/")).toBe(true);
      }
    }
  });

  it("gives every answer words to be found by", () => {
    for (const answer of SPOT_ANSWERS) {
      expect(answer.keywords.length, `${answer.id} has no keywords`).toBeGreaterThan(2);
    }
  });

  it("keeps every answer short enough to be a signpost", () => {
    for (const answer of SPOT_ANSWERS) {
      expect(answer.body.length, `${answer.id} is a essay, not a signpost`).toBeLessThan(280);
    }
  });
});
