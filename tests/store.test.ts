import { beforeEach, describe, expect, it } from "vitest";
import { AccessDeniedError } from "@/lib/api/provider";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";
import { BUTTON_PRICES_CENTS, type ButtonDesign } from "@/lib/api/types";
import { assessPhotoQuality } from "@/lib/store-rules";
import { buildManifestCsv, countButtons, MANIFEST_COLUMNS } from "@/lib/button-manifest";

/**
 * Phase 5 verification:
 *  - a test-mode purchase completes, appears in the admin queue, and
 *    produces a correct print-ready export
 *  - low-resolution uploads are caught before checkout
 */

const provider = new MockDataProvider();

beforeEach(() => {
  resetMockStore();
});

const design = (overrides: Partial<ButtonDesign> = {}): ButtonDesign => ({
  photoUrl: "data:image/png;base64,AAAA",
  photoWidth: 1200,
  photoHeight: 1600,
  studentName: "Ava",
  role: "Young Elsa",
  size: "2.25",
  style: "classic",
  templateId: "tpl-frozen",
  ...overrides,
});

describe("photo quality guard (#11)", () => {
  it("accepts a photo with enough pixels for the chosen size", () => {
    expect(assessPhotoQuality(1200, 1600, "2.25").quality).toBe("good");
  });

  it("flags a photo that is too small as low quality with guidance", () => {
    const result = assessPhotoQuality(300, 300, "3.5");
    expect(result.quality).toBe("low");
    expect(result.message).toContain("too small");
    expect(result.dpi).toBeLessThan(150);
  });

  it("uses the shorter edge, since a button is a circle", () => {
    // Wide but short: 2000x400 is not good enough for a 2.25" button.
    expect(assessPhotoQuality(2000, 400, "2.25").quality).not.toBe("good");
  });

  it("scales its verdict with the button size", () => {
    // 800px is fine at 2.25" but not at 3.5".
    expect(assessPhotoQuality(800, 800, "2.25").quality).toBe("good");
    expect(assessPhotoQuality(800, 800, "3.5").quality).not.toBe("good");
  });
});

describe("cart (#11)", () => {
  it("prices items by size and totals correctly", async () => {
    await provider.addToCart("user-sofia", design(), 3);
    await provider.addToCart("user-sofia", design({ size: "3.5" }), 1);
    const cart = await provider.getCart("user-sofia");

    expect(cart).toHaveLength(2);
    expect(cart[0].unitPriceCents).toBe(BUTTON_PRICES_CENTS["2.25"]);
    expect(cart[1].unitPriceCents).toBe(BUTTON_PRICES_CENTS["3.5"]);

    const total = cart.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
    expect(total).toBe(BUTTON_PRICES_CENTS["2.25"] * 3 + BUTTON_PRICES_CENTS["3.5"]);
  });

  it("carts are per-user — one family cannot see another's", async () => {
    await provider.addToCart("user-sofia", design(), 2);
    expect(await provider.getCart("user-ngozi")).toHaveLength(0);
  });

  it("setting quantity to zero removes the item", async () => {
    await provider.addToCart("user-sofia", design(), 2);
    const [item] = await provider.getCart("user-sofia");
    const after = await provider.updateCartItem("user-sofia", item.id, 0);
    expect(after).toHaveLength(0);
  });
});

describe("checkout → admin queue → export (#11)", () => {
  async function placeOrder() {
    await provider.addToCart("user-sofia", design(), 2);
    await provider.addToCart("user-sofia", design({ studentName: "Leo", role: "Ensemble" }), 1);
    const order = await provider.createOrder("user-sofia", "pending");
    await provider.markOrderPaid(order.reference, "mock_pi_test");
    return order;
  }

  it("a completed purchase creates a paid order and empties the cart", async () => {
    const order = await placeOrder();
    expect(order.reference).toMatch(/^NPA-\d+$/);
    expect(order.subtotalCents).toBe(BUTTON_PRICES_CENTS["2.25"] * 3);
    expect(await provider.getCart("user-sofia")).toHaveLength(0);

    const paid = await provider.getOrder("user-sofia", order.id);
    expect(paid?.paidAt).toBeTruthy();
    expect(paid?.paymentRef).toBe("mock_pi_test");
  });

  it("the order appears in the admin queue as new", async () => {
    await placeOrder();
    const queue = await provider.getAllOrders("user-dana", "new");
    expect(queue).toHaveLength(1);
    expect(countButtons(queue)).toBe(3);
  });

  it("moves through the fulfillment states and notifies on ready", async () => {
    const order = await placeOrder();
    await provider.updateOrderStatus("user-dana", order.id, "in_production");
    expect((await provider.getAllOrders("user-dana", "in_production"))).toHaveLength(1);

    await provider.updateOrderStatus("user-dana", order.id, "ready", "At the front desk");
    const ready = await provider.getOrder("user-sofia", order.id);
    expect(ready?.status).toBe("ready");
    expect(ready?.adminNote).toBe("At the front desk");

    const notifications = await provider.getNotifications("user-sofia");
    expect(notifications.some((n) => n.title.includes("ready"))).toBe(true);
  });

  it("produces a correct CSV manifest", async () => {
    await placeOrder();
    const orders = await provider.getAllOrders("user-dana");
    const csv = buildManifestCsv(orders);
    const lines = csv.trim().split("\r\n");

    expect(lines[0]).toBe(MANIFEST_COLUMNS.join(","));
    expect(lines).toHaveLength(3); // header + 2 distinct designs

    const ava = lines.find((line) => line.includes("Ava"))!;
    expect(ava).toContain("NPA-");
    expect(ava).toContain("2.25");
    expect(ava).toContain("good");
    // quantity column
    expect(ava.split(",")).toContain("2");
  });

  it("escapes commas and quotes in the manifest", async () => {
    await provider.addToCart(
      "user-sofia",
      design({ studentName: 'Ava "Bean", Jr.', role: "Elsa, understudy" }),
      1
    );
    const order = await provider.createOrder("user-sofia", "pending");
    await provider.markOrderPaid(order.reference, "x");
    const csv = buildManifestCsv(await provider.getAllOrders("user-dana"));

    expect(csv).toContain('"Ava ""Bean"", Jr."');
    expect(csv).toContain('"Elsa, understudy"');
    // The escaped field must not split the row.
    expect(csv.trim().split("\r\n")).toHaveLength(2);
  });

  it("flags low-resolution items in the manifest for the press operator", async () => {
    await provider.addToCart(
      "user-sofia",
      design({ photoWidth: 200, photoHeight: 200, size: "3.5" }),
      1
    );
    const order = await provider.createOrder("user-sofia", "pending");
    await provider.markOrderPaid(order.reference, "x");
    const csv = buildManifestCsv(await provider.getAllOrders("user-dana"));
    expect(csv).toContain("low");
  });

  it("reorder puts the same items back in the cart", async () => {
    const order = await placeOrder();
    const cart = await provider.reorder("user-sofia", order.id);
    expect(cart).toHaveLength(2);
    expect(cart[0].studentName).toBe("Ava");
    // Fresh cart ids, not the order's item ids.
    expect(cart[0].id).not.toBe(order.items[0].id);
  });

  it("marking paid twice does not overwrite the original payment time", async () => {
    const order = await placeOrder();
    const first = await provider.getOrder("user-sofia", order.id);
    const again = await provider.markOrderPaid(order.reference, "different_ref");
    expect(again?.paidAt).toBe(first?.paidAt);
    expect(again?.paymentRef).toBe("mock_pi_test");
  });
});

describe("store access control", () => {
  it("another family cannot read an order", async () => {
    await provider.addToCart("user-sofia", design(), 1);
    const order = await provider.createOrder("user-sofia", "pending");
    await expect(provider.getOrder("user-ngozi", order.id)).rejects.toThrow(
      AccessDeniedError
    );
    await expect(
      provider.getOrdersForFamily("user-ngozi", "fam-martinez")
    ).rejects.toThrow(AccessDeniedError);
  });

  it("the admin queue and status changes are staff-only", async () => {
    await provider.addToCart("user-sofia", design(), 1);
    const order = await provider.createOrder("user-sofia", "pending");
    await expect(provider.getAllOrders("user-sofia")).rejects.toThrow(AccessDeniedError);
    await expect(
      provider.updateOrderStatus("user-sofia", order.id, "ready")
    ).rejects.toThrow(AccessDeniedError);
  });

  it("only admins can change a production's button template", async () => {
    await expect(
      provider.upsertButtonTemplate("user-marcus", {
        productionId: "prod-frozen",
        name: "Sneaky",
        accentColor: "#000",
        seasonName: "2026–2027",
        isActive: true,
      })
    ).rejects.toThrow(AccessDeniedError);

    const template = await provider.upsertButtonTemplate("user-dana", {
      productionId: "prod-frozen",
      name: "Opening night frame",
      accentColor: "#4f8fd6",
      seasonName: "2026–2027",
      isActive: true,
    });
    expect(template.id).toBeTruthy();
  });

  it("templates are scoped per production", async () => {
    const frozen = await provider.getButtonTemplates("prod-frozen");
    expect(frozen).toHaveLength(1);
    expect(frozen[0].productionId).toBe("prod-frozen");
  });

  it("an empty cart cannot become an order", async () => {
    await expect(provider.createOrder("user-sofia", "pending")).rejects.toThrow(
      "Cart is empty"
    );
  });
});
