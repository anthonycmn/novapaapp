import { beforeEach, describe, expect, it } from "vitest";
import { AccessDeniedError } from "@/lib/api/provider";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";
import { priceFor } from "@/lib/api/store/catalog";
import { SPIRIT_BUTTON_PRICE_CENTS } from "@/lib/api/types";
import * as seed from "@/lib/api/mock/seed-data";

const provider = new MockDataProvider();

beforeEach(() => {
  resetMockStore();
});

async function healthThread() {
  return provider.startMessageThread("user-sofia", {
    recipientRole: "health_safety",
    subject: "Ava's EpiPen",
    body: "Where should we store it during tech week?",
    studentId: "stu-ava",
  });
}

describe("a message reaches the person whose concern it is", () => {
  /**
   * The family picks "A question about choreography". Priya owns that route,
   * and she is neither an administrator nor the health & safety director —
   * which is exactly the case the old role-only model had no answer for.
   */
  async function choreographyThread() {
    return provider.startMessageThread("user-sofia", {
      topicId: "route-choreography",
      subject: "Tap shoes for Ava",
      body: "Does she need character shoes for Thursday?",
    });
  }

  it("records who it was addressed to, in the family's own words", async () => {
    const thread = await choreographyThread();
    expect(thread.routeTopic).toBe("A question about choreography");
    expect(thread.recipientName).toBe("Priya Raman");
    expect(thread.recipientTitle).toBe("Choreographer & Teaching Artist");
    expect(thread.recipientEmail).toBe("priya@example.org");
  });

  it("the person it is addressed to can read it, even as ordinary staff", async () => {
    const thread = await choreographyThread();
    expect(await provider.getStaffInbox("user-priya")).toHaveLength(1);
    expect(await provider.getThread("user-priya", thread.id)).not.toBeNull();
    // ...and it stays private from the staff member next to her.
    expect(await provider.getStaffInbox("user-marcus")).toHaveLength(0);
  });

  it("naming somebody does not hide the thread from the administrators", async () => {
    // The whole point of keeping a coverage role: nothing waits on one inbox.
    await choreographyThread();
    expect(await provider.getStaffInbox("user-dana")).toHaveLength(1);
  });

  it("a health topic still reaches the health & safety cover", async () => {
    await provider.startMessageThread("user-sofia", {
      topicId: "route-allergies",
      subject: "Ava's EpiPen",
      body: "Where should we store it?",
      studentId: "stu-ava",
    });
    expect(await provider.getStaffInbox("user-jo")).toHaveLength(1);
    expect(await provider.getStaffInbox("user-dana")).toHaveLength(1);
    expect(await provider.getStaffInbox("user-marcus")).toHaveLength(0);
  });

  it("refuses to invent a recipient it cannot resolve", async () => {
    // A routeId is a string off the wire. One that is not on the live list
    // must not address a thread to anybody — it falls back to the office.
    const thread = await provider.startMessageThread("user-sofia", {
      topicId: "route-that-does-not-exist",
      subject: "Hello",
      body: "…",
    });
    expect(thread.recipientName).toBeUndefined();
    expect(thread.recipientEmail).toBeUndefined();
    expect(thread.recipientRole).toBe("admin");
    // And it is still readable by the office, rather than lost.
    expect(await provider.getStaffInbox("user-dana")).toHaveLength(1);
  });

  it("every offered topic can actually be delivered to", async () => {
    const topics = await provider.listMessageTopics();
    expect(topics.length).toBeGreaterThan(0);
    for (const topic of topics) {
      expect(topic.recipientEmail).toMatch(/@/);
      expect(topic.recipientName).not.toBe("");
      expect(topic.staffId).not.toBe("");
    }
  });
});

describe("messages route to a role, not a person", () => {
  it("a family can start a thread and see it", async () => {
    const thread = await healthThread();
    expect(thread.status).toBe("open");
    const mine = await provider.getMyThreads("user-sofia");
    expect(mine).toHaveLength(1);
  });

  it("another family cannot read it", async () => {
    const thread = await healthThread();
    await expect(provider.getThread("user-ngozi", thread.id)).rejects.toThrow(
      AccessDeniedError
    );
    expect(await provider.getMyThreads("user-ngozi")).toHaveLength(0);
  });

  it("health & safety threads reach the H&S director and admins, not all staff", async () => {
    await healthThread();

    // Jo is flagged as Director of Health and Safety.
    const joInbox = await provider.getStaffInbox("user-jo");
    expect(joInbox).toHaveLength(1);

    // Dana is an admin — sees everything.
    expect(await provider.getStaffInbox("user-dana")).toHaveLength(1);

    // Marcus is ordinary staff — must not see a health message.
    expect(await provider.getStaffInbox("user-marcus")).toHaveLength(0);
  });

  it("admin-addressed threads do not leak to non-admin staff", async () => {
    await provider.startMessageThread("user-sofia", {
      recipientRole: "admin",
      subject: "Billing question",
      body: "Can we split the payment?",
    });
    expect(await provider.getStaffInbox("user-marcus")).toHaveLength(0);
    expect(await provider.getStaffInbox("user-jo")).toHaveLength(0); // H&S only
    expect(await provider.getStaffInbox("user-dana")).toHaveLength(1);
  });

  it("ordinary staff cannot open a thread directly by id", async () => {
    const thread = await healthThread();
    await expect(provider.getThread("user-marcus", thread.id)).rejects.toThrow(
      AccessDeniedError
    );
  });

  it("notifies everyone covering the role, so nothing waits on one inbox", async () => {
    await healthThread();
    const jo = await provider.getNotifications("user-jo", "staff");
    const dana = await provider.getNotifications("user-dana", "staff");
    const marcus = await provider.getNotifications("user-marcus", "staff");
    expect(jo.some((n) => n.type === "direct_message")).toBe(true);
    expect(dana.some((n) => n.type === "direct_message")).toBe(true);
    expect(marcus.some((n) => n.type === "direct_message")).toBe(false);
  });

  it("keeps another family's message out of the reader's own notifications", async () => {
    /*
     * 0056. A message from somebody else's family is office work, and an
     * administrator who is also a parent must not find it on the page she
     * opens to see news about her own child. It is still hers to answer —
     * it is in the office pile, and it still counts as unread there.
     */
    await healthThread();
    const mine = await provider.getNotifications("user-dana");
    expect(mine.some((n) => n.type === "direct_message")).toBe(false);
    expect(
      await provider.getUnreadNotificationCount("user-dana", "staff")
    ).toBeGreaterThan(0);
  });

  it("cannot address a thread about another family's child", async () => {
    await expect(
      provider.startMessageThread("user-sofia", {
        recipientRole: "admin",
        subject: "About Chidi",
        body: "…",
        studentId: "stu-chidi",
      })
    ).rejects.toThrow(AccessDeniedError);
  });

  it("staff reply lands as staff, and notifies the family", async () => {
    const thread = await healthThread();
    const reply = await provider.replyToThread("user-jo", thread.id, "Front desk fridge.");
    expect(reply.authorSide).toBe("staff");

    const sofia = await provider.getNotifications("user-sofia");
    expect(sofia.some((n) => n.title === "Reply from NOVA PA")).toBe(true);
  });

  it("a reply reopens a closed thread", async () => {
    const thread = await healthThread();
    await provider.setThreadStatus("user-jo", thread.id, "closed");
    await provider.replyToThread("user-sofia", thread.id, "One more thing…");
    const view = await provider.getThread("user-sofia", thread.id);
    expect(view?.thread.status).toBe("open");
  });

  it("only covering staff can close a thread", async () => {
    const thread = await healthThread();
    await expect(
      provider.setThreadStatus("user-marcus", thread.id, "closed")
    ).rejects.toThrow(AccessDeniedError);
    await expect(
      provider.setThreadStatus("user-sofia", thread.id, "closed")
    ).rejects.toThrow(AccessDeniedError);
  });

  it("unread counts follow the reader's side", async () => {
    const thread = await healthThread();
    // Jo hasn't read the family's opening message.
    expect(await provider.getUnreadMessageCount("user-jo")).toBe(1);
    await provider.markThreadRead("user-jo", thread.id);
    expect(await provider.getUnreadMessageCount("user-jo")).toBe(0);

    await provider.replyToThread("user-jo", thread.id, "Answered");
    // Now the family has one unread; Jo has none (own message).
    expect(await provider.getUnreadMessageCount("user-sofia")).toBe(1);
    expect(await provider.getUnreadMessageCount("user-jo")).toBe(0);
  });

  it("staff cannot start a thread as a family", async () => {
    await expect(
      provider.startMessageThread("user-marcus", {
        recipientRole: "admin",
        subject: "x",
        body: "y",
      })
    ).rejects.toThrow(AccessDeniedError);
  });
});

describe("store catalog: star pages and lessons", () => {
  it("lists active products", async () => {
    const products = await provider.getProducts();
    expect(products.some((p) => p.type === "star_page")).toBe(true);
    expect(products.filter((p) => p.type === "private_lesson").length).toBeGreaterThan(1);
  });

  it("prices the chosen option from the catalog, not the client", async () => {
    const starPage = seed.products.find((p) => p.id === "prod-starpage-frozen")!;
    expect(priceFor(starPage, "quarter")).toBe(3500);
    expect(priceFor(starPage, "full")).toBe(10000);

    const cart = await provider.addCatalogItemToCart("user-sofia", {
      productId: "prod-starpage-frozen",
      optionValue: "full",
      quantity: 1,
      customization: {
        kind: "star_page",
        studentName: "Ava",
        pageSize: "full",
        message: "So proud!",
        signature: "Mom and Dad",
      },
    });
    expect(cart[0].unitPriceCents).toBe(10000);
    expect(cart[0].displayName).toContain("Full page");
  });

  it("rejects an option that doesn't belong to the product", async () => {
    await expect(
      provider.addCatalogItemToCart("user-sofia", {
        productId: "prod-starpage-frozen",
        optionValue: "free-please",
        quantity: 1,
        customization: {
          kind: "star_page",
          studentName: "Ava",
          pageSize: "x",
          message: "m",
          signature: "s",
        },
      })
    ).rejects.toThrow(/option/i);
  });

  it("buttons and catalog items share one cart and check out together", async () => {
    await provider.addToCart(
      "user-sofia",
      {
        photoUrl: "data:image/png;base64,AA",
        photoWidth: 1200,
        photoHeight: 1200,
        studentName: "Ava",
        role: "Young Elsa",
        size: "2.25",
        style: "classic",
        templateId: "tpl-frozen",
      },
      2
    );
    await provider.addCatalogItemToCart("user-sofia", {
      productId: "prod-voice-lessons",
      optionValue: "single-30",
      quantity: 1,
      customization: {
        kind: "private_lesson",
        studentName: "Ava",
        packageOption: "Single 30-minute lesson",
        notes: "",
      },
    });

    const cart = await provider.getCart("user-sofia");
    expect(cart).toHaveLength(2);
    expect(cart.map((item) => item.productType).sort()).toEqual([
      "private_lesson",
      "spirit_button",
    ]);

    const order = await provider.createOrder("user-sofia", "pay-1");
    // 2 spirit buttons + one $65 lesson. Priced off the constant rather than a
    // literal, so a price change is a one-line change and not a broken test.
    expect(order.subtotalCents).toBe(2 * SPIRIT_BUTTON_PRICE_CENTS + 6500);
  });

  it("a lesson carries its teacher preference through to the order", async () => {
    await provider.addCatalogItemToCart("user-sofia", {
      productId: "prod-acting-lessons",
      optionValue: "single-60",
      quantity: 1,
      customization: {
        kind: "private_lesson",
        studentName: "Ava",
        packageOption: "Single 60-minute session",
        preferredStaffId: "staff-dana",
        notes: "Audition prep",
      },
    });
    const order = await provider.createOrder("user-sofia", "pay-2");
    const item = order.items[0];
    expect(item.customization).toMatchObject({
      kind: "private_lesson",
      preferredStaffId: "staff-dana",
      notes: "Audition prep",
    });
  });

  it("the press manifest ignores non-button products", async () => {
    const { buildManifestCsv } = await import("@/lib/button-manifest");
    await provider.addCatalogItemToCart("user-sofia", {
      productId: "prod-voice-lessons",
      optionValue: "single-30",
      quantity: 1,
      customization: {
        kind: "private_lesson",
        studentName: "Ava",
        packageOption: "Single 30-minute lesson",
        notes: "",
      },
    });
    await provider.createOrder("user-sofia", "pay-3");
    const csv = buildManifestCsv(await provider.getAllOrders("user-dana"));
    // Header only — nothing to press.
    expect(csv.trim().split("\r\n")).toHaveLength(1);
  });
});
