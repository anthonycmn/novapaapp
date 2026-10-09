import { beforeEach, describe, expect, it } from "vitest";
import { EncoreService } from "@/lib/encore/service";
import { MockEncoreRepo, mockEncore, mockEncoreAdd, mockEncoreLaunch, mockEncoreReset } from "@/lib/encore/repo-mock";
import { FIRST_REWARD_POINTS, nextReward, pointsFor, seasonStart, tierFor, toNextTier } from "@/lib/encore/rules";
import { visibleSections, FAMILY_SECTIONS } from "@/config/navigation";
import type { SessionUser } from "@/lib/api/types";

/**
 * Encore Points (hub 0098). The numbers CJ signed off on, and the gate that
 * keeps the whole program invisible until he presses Launch.
 */

const parent = (familyId: string) => ({ id: `user-${familyId}`, email: `${familyId}@example.com`, role: "parent", familyId }) as unknown as SessionUser;

describe("the arithmetic", () => {
  it("earns 10 points per $1, 11 at Director, 12.5 at Producer", () => {
    expect(pointsFor(79500, "patron")).toBe(7950);
    expect(pointsFor(10000, "director")).toBe(1100);
    expect(pointsFor(10000, "producer")).toBe(1250);
    expect(pointsFor(999, "producer")).toBe(124); // floor, never rounds up
  });

  it("puts a $795 Broadway Bound registration 50 points short of the first reward, on purpose", () => {
    expect(FIRST_REWARD_POINTS).toBe(8000);
    expect(FIRST_REWARD_POINTS - pointsFor(79500, "patron")).toBe(50);
  });

  it("sets tiers at $1,500 and $3,000, and a tier holds through the next season", () => {
    expect(tierFor(149_999)).toBe("patron");
    expect(tierFor(150_000)).toBe("director");
    expect(tierFor(300_000)).toBe("producer");
    expect(tierFor(0, 310_000)).toBe("producer");
  });

  it("starts a season on Sep 1 in New York", () => {
    expect(seasonStart(new Date("2026-10-09T12:00:00Z")).toISOString()).toBe("2026-09-01T04:00:00.000Z");
    expect(seasonStart(new Date("2027-08-31T12:00:00Z")).toISOString()).toBe("2026-09-01T04:00:00.000Z");
    expect(seasonStart(new Date("2026-09-01T03:59:00Z")).toISOString()).toBe("2025-09-01T04:00:00.000Z");
  });

  it("names the next reward and the next tier", () => {
    const rewards = [
      { key: "a", kind: "spirit_button", title: "A", blurb: "", points: 8000, valueCents: 1200, sort: 1 },
      { key: "b", kind: "show_ticket", title: "B", blurb: "", points: 10000, valueCents: 3000, sort: 2 },
    ] as const;
    expect(nextReward(7950, [...rewards])?.short).toBe(50);
    expect(nextReward(9000, [...rewards])?.reward.key).toBe("b");
    expect(nextReward(10000, [...rewards])).toBeNull();
    expect(toNextTier("patron", 100_000)).toEqual({ tier: "director", cents: 50_000 });
    expect(toNextTier("producer", 400_000)).toBeNull();
  });
});

describe("the launch gate", () => {
  beforeEach(() => mockEncoreReset());
  const service = new EncoreService(new MockEncoreRepo());

  it("hides everything from a family that is not on the preview list until launch", async () => {
    const nguyen = parent("fam-nguyen");
    expect(await service.isOpen(nguyen)).toBe(false);
    expect(await service.summary(nguyen)).toBeNull();
    await expect(service.redeem(nguyen, "show_ticket", null, {})).rejects.toThrow(/not open/);
    mockEncoreLaunch(true);
    expect(await service.isOpen(nguyen)).toBe(true);
  });

  it("keeps the menu item out of the sidebar unless the gate is open", () => {
    const hrefs = (gates: string[]) => visibleSections(FAMILY_SECTIONS, gates).map((s) => s.href);
    expect(hrefs([])).not.toContain("/family/rewards");
    expect(hrefs(["encore"])).toContain("/family/rewards");
  });

  it("pausing hides it again", async () => {
    mockEncoreLaunch(true);
    mockEncore().paused = true;
    mockEncore().preview.clear();
    expect(await service.isOpen(parent("fam-martinez"))).toBe(false);
  });
});

describe("redeeming", () => {
  beforeEach(() => mockEncoreReset());
  const service = new EncoreService(new MockEncoreRepo());
  const martinez = parent("fam-martinez");
  const okafor = parent("fam-okafor");

  it("shows Okafor the almost-there state and refuses the reward", async () => {
    const s = await service.summary(okafor);
    expect(s?.balance).toBe(7950);
    expect(s?.next?.short).toBe(50);
    expect(s?.affordable).toEqual([]);
    await expect(service.redeem(okafor, "spirit_button", null, {})).rejects.toThrow("You need 50 more points");
  });

  it("gives a show-night pack two concession codes and a gram for the student", async () => {
    const res = await service.redeem(martinez, "show_night_pack", "stu-ava", { message: "Break a leg!", from: "Mom" });
    expect(res.balance).toBe(850);
    expect(res.codes.filter((c) => c.item === "concession")).toHaveLength(2);
    const [r] = await new MockEncoreRepo().redemptions("fam-martinez");
    expect(r.items.find((i) => i.item === "gram")?.detail).toMatchObject({ message: "Break a leg!", from: "Mom" });
  });

  it("needs a student and a size for a t-shirt", async () => {
    mockEncoreAdd("fam-martinez", 20000);
    await expect(service.redeem(martinez, "tshirt", null, {})).rejects.toThrow(/which student/);
    const res = await service.redeem(martinez, "tshirt", "stu-ava", {});
    expect(res.title).toBe("NOVA PA t-shirt"); // fell back to the student's size on file
  });

  it("allows one registration credit per student per season", async () => {
    mockEncoreAdd("fam-martinez", 100000);
    const first = await service.redeem(martinez, "registration_25", "stu-ava", {});
    expect(first.codes[0].code).toMatch(/^ENC[2-9A-HJ-NP-Z]{7}$/);
    await expect(service.redeem(martinez, "registration_25", "stu-ava", {})).rejects.toThrow(/already has money off/);
    await expect(service.redeem(martinez, "registration_25", "stu-leo", {})).resolves.toBeTruthy();
  });

  it("refuses another family's student", async () => {
    await expect(service.redeem(martinez, "show_night_pack", "stu-chidi", {})).rejects.toThrow(/your own students/);
  });
});

describe("store vouchers at checkout", () => {
  beforeEach(() => mockEncoreReset());
  const service = new EncoreService(new MockEncoreRepo());
  const martinez = parent("fam-martinez");

  it("covers one quantity-1 spirit button line, once", async () => {
    await service.redeem(martinez, "spirit_button", "stu-ava", {});
    const cart = [
      { id: "c1", productType: "spirit_button", quantity: 2 },
      { id: "c2", productType: "spirit_button", quantity: 1 },
      { id: "c3", productType: "spirit_button", quantity: 1 },
    ];
    const plan = await service.planVouchers(martinez, cart);
    expect(Object.keys(plan.lines)).toEqual(["c2"]);
    await service.useVouchers(martinez, plan, "NPA-1");
    expect(Object.keys((await service.planVouchers(martinez, cart)).lines)).toEqual([]);
  });

  it("matches a star page voucher to the same size only", async () => {
    mockEncoreAdd("fam-martinez", 20000);
    await service.redeem(martinez, "star_page_quarter", "stu-ava", {});
    const plan = await service.planVouchers(martinez, [
      { id: "half", productType: "star_page", optionValue: "half", quantity: 1 },
      { id: "quarter", productType: "star_page", optionValue: "quarter", quantity: 1 },
    ]);
    expect(Object.keys(plan.lines)).toEqual(["quarter"]);
  });
});
