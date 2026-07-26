import { beforeEach, describe, expect, it } from "vitest";
import { AccessDeniedError } from "@/lib/api/provider";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";

/**
 * Phase 2 verification:
 *  - a post targeted at one production reaches only those families
 *  - question threads are private to asker + staff (FAQ publishing opens them)
 *  - every notification-worthy event writes an in-app record
 *  - email audience targeting + opt-out semantics
 */

const provider = new MockDataProvider();

beforeEach(() => {
  resetMockStore();
});

describe("feed targeting (#7)", () => {
  it("a production-targeted post reaches enrolled families only", async () => {
    // Amara (fam-okafor) is class-only; but Chidi (same family) is in Frozen —
    // so Okafor sees it. All three seed families have a Frozen student.
    // Create a post targeted at prod-mermaid (nobody enrolled).
    await provider.createFeedPost("user-dana", {
      body: "Mermaid families only",
      category: "general",
      audience: { productionIds: ["prod-mermaid"] },
    });
    const sofiaFeed = await provider.getFeedForUser("user-sofia");
    expect(sofiaFeed.some((p) => p.body === "Mermaid families only")).toBe(false);

    // Frozen-targeted post reaches the Martinez family.
    await provider.createFeedPost("user-dana", {
      body: "Frozen families only",
      category: "rehearsal",
      audience: { productionIds: ["prod-frozen"] },
    });
    const sofiaFeed2 = await provider.getFeedForUser("user-sofia");
    expect(sofiaFeed2.some((p) => p.body === "Frozen families only")).toBe(true);
  });

  it("parents cannot post", async () => {
    await expect(
      provider.createFeedPost("user-sofia", {
        body: "parent post",
        category: "general",
        audience: {},
      })
    ).rejects.toThrow(AccessDeniedError);
  });

  it("pinned posts sort first", async () => {
    const feed = await provider.getFeedForUser("user-sofia");
    expect(feed[0].isPinned).toBe(true);
  });
});

describe("private questions (#7)", () => {
  it("another parent cannot see someone's private question", async () => {
    // Seed q-2 is Minh's unanswered private question on the fitting post.
    const sofiaView = await provider.getQuestionsForPost("user-sofia", "post-frozen-fitting");
    expect(sofiaView.some((q) => q.id === "q-2")).toBe(false);
    // Minh sees their own.
    const minhView = await provider.getQuestionsForPost("user-minh", "post-frozen-fitting");
    expect(minhView.some((q) => q.id === "q-2")).toBe(true);
    // Staff see everything.
    const staffView = await provider.getQuestionsForPost("user-marcus", "post-frozen-fitting");
    expect(staffView.some((q) => q.id === "q-2")).toBe(true);
  });

  it("published FAQs are visible to everyone", async () => {
    const sofiaView = await provider.getQuestionsForPost("user-sofia", "post-frozen-fitting");
    expect(sofiaView.some((q) => q.id === "q-1" && q.isPublicFaq)).toBe(true);
  });

  it("answering notifies the asker with an in-app record", async () => {
    await provider.answerQuestion("user-jo", "q-2", "Thursday is fine for Lily!", false);
    const minhNotifications = await provider.getNotifications("user-minh");
    expect(minhNotifications.some((n) => n.type === "direct_message")).toBe(true);
  });

  it("moderation queue lists only unanswered questions, staff-only", async () => {
    const queue = await provider.getOpenQuestions("user-dana");
    expect(queue.map((q) => q.id)).toEqual(["q-2"]);
    await expect(provider.getOpenQuestions("user-sofia")).rejects.toThrow(AccessDeniedError);
  });
});

describe("notifications (#2)", () => {
  it("a new targeted post writes in-app records for targeted families only", async () => {
    await provider.createFeedPost("user-dana", {
      title: "Tech week!",
      body: "Frozen tech week schedule is up.",
      category: "show_week",
      audience: { productionIds: ["prod-frozen"] },
    });
    const sofia = await provider.getNotifications("user-sofia");
    expect(sofia.some((n) => n.title === "Tech week!")).toBe(true);
  });

  it("per-type opt-out suppresses new records of that type", async () => {
    await provider.updateNotificationPrefs("user-sofia", {
      enabled: { feed_post: false },
    });
    await provider.createFeedPost("user-dana", {
      title: "Another post",
      body: "…",
      category: "general",
      audience: {},
    });
    const sofia = await provider.getNotifications("user-sofia");
    expect(sofia.some((n) => n.title === "Another post")).toBe(false);
  });

  it("unread count and mark-all-read work", async () => {
    await provider.broadcastNotification("user-dana", {
      type: "broadcast",
      title: "Snow closure",
      body: "Studio closed tonight.",
      audience: {},
    });
    expect(await provider.getUnreadNotificationCount("user-sofia")).toBeGreaterThan(0);
    await provider.markAllNotificationsRead("user-sofia");
    expect(await provider.getUnreadNotificationCount("user-sofia")).toBe(0);
  });
});

describe("email (#1)", () => {
  it("audience resolves to parents of enrolled students only", async () => {
    const everyone = await provider.resolveAudience("user-dana", {});
    expect(everyone.map((u) => u.id).sort()).toEqual(
      ["user-minh", "user-ngozi", "user-sofia"].sort()
    );
    const frozenOnly = await provider.resolveAudience("user-dana", {
      productionIds: ["prod-frozen"],
    });
    expect(frozenOnly.length).toBe(3); // all three families have a Frozen student
    const mermaidOnly = await provider.resolveAudience("user-dana", {
      productionIds: ["prod-mermaid"],
    });
    expect(mermaidOnly.length).toBe(0);
  });

  it("test-to-self records a single-recipient send", async () => {
    const send = await provider.sendEmail("user-dana", {
      subject: "Test",
      body: "Hello {{parent_first}}",
      category: "newsletter",
      audience: {},
      testToSelf: true,
    });
    expect(send.stats.total).toBe(1);
  });

  it("parents cannot use the email system", async () => {
    await expect(provider.getEmailTemplates("user-sofia")).rejects.toThrow(AccessDeniedError);
  });
});
