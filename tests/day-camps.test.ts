import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ageOn,
  bandChoiceForAge,
  parseAgeBand,
  priceDays,
  DAY_CAMP_PACK_CENTS,
  DAY_CAMP_PRICE_CENTS,
} from "@/config/day-camps";
import {
  assemblePunchCards,
  fetchPunchCards,
  type PunchCardInput,
} from "@/lib/api/registration/punch-card";
import {
  mockPunchCardInput,
  resetMockPunchCards,
} from "@/lib/api/registration/punch-card-mock";
import { reconcile, type ReconcileInput } from "@/lib/api/registration/reconcile";
import type { Enrollment, Production, Student } from "@/lib/api/types";

/**
 * The Day Camp Punch Card (13 Sep 2026).
 *
 * The rules a parent relies on without knowing they are rules: which age
 * group a child lands on, what five days cost, that a day cannot be booked
 * twice, and that a page that cannot read the register says so rather than
 * saying "no credits".
 */

/* ── bands ─────────────────────────────────────────────────────────────── */

describe("age bands", () => {
  it("are parsed from the catalog's age_range text, en dash and all", () => {
    expect(parseAgeBand("5 – 9 yrs")).toEqual({ key: "5-9", lo: 5, hi: 9, label: "Ages 5–9" });
    expect(parseAgeBand("12-15")).toMatchObject({ key: "12-15" });
    expect(parseAgeBand(null)).toBeNull();
    expect(parseAgeBand("Improv Olympics")).toBeNull();
  });

  it("default the way the website sells them, with the overlaps offered", () => {
    expect(bandChoiceForAge(8)).toEqual({ defaultKey: "5-9", offered: ["5-9"] });
    expect(bandChoiceForAge(9)).toEqual({ defaultKey: "5-9", offered: ["5-9", "9-12"] });
    expect(bandChoiceForAge(10)).toEqual({ defaultKey: "9-12", offered: ["9-12"] });
    expect(bandChoiceForAge(12)).toEqual({ defaultKey: "9-12", offered: ["9-12", "12-15"] });
    expect(bandChoiceForAge(13)).toEqual({ defaultKey: "12-15", offered: ["12-15"] });
  });

  it("choose nothing for a child outside every band, or with no birthday", () => {
    expect(bandChoiceForAge(null).defaultKey).toBeNull();
    expect(bandChoiceForAge(null).offered).toHaveLength(3);
    expect(bandChoiceForAge(16).defaultKey).toBeNull();
    expect(bandChoiceForAge(16).note).toMatch(/16/);
    expect(bandChoiceForAge(4).defaultKey).toBeNull();
  });

  it("count whole years on the day itself", () => {
    expect(ageOn("2017-10-01", "2026-09-30")).toBe(8);
    expect(ageOn("2017-10-01", "2026-10-01")).toBe(9);
    expect(ageOn(null, "2026-10-01")).toBeNull();
  });
});

/* ── the cart-form pack, as priceCart prices it ───────────────────────── */

describe("priceDays matches the website's cart-form pack rule", () => {
  it("five days are the pack", () => {
    expect(priceDays(5)).toMatchObject({ cents: 34900, packs: 1, singles: 0 });
    expect(priceDays(5).nudge).toBeUndefined();
    expect(5 * DAY_CAMP_PRICE_CENTS).toBe(39500); // what they would have paid
    expect(DAY_CAMP_PACK_CENTS).toBe(34900);
  });

  it("four days are $316 and the nudge says add one more", () => {
    const p = priceDays(4);
    expect(p.cents).toBe(31600);
    expect(p.nudge).toEqual({ more: 1, totalDays: 5, totalCents: 34900 });
  });

  it("packs stack; the remainder pays $79", () => {
    expect(priceDays(10)).toMatchObject({ cents: 69800, packs: 2, singles: 0 });
    expect(priceDays(6)).toMatchObject({ cents: 42800, packs: 1, singles: 1 });
    expect(priceDays(6).nudge).toEqual({ more: 4, totalDays: 10, totalCents: 69800 });
    expect(priceDays(0)).toMatchObject({ cents: 0, packs: 0 });
    expect(priceDays(0).nudge).toBeUndefined();
  });
});

/* ── assembling a card ────────────────────────────────────────────────── */

function inputWith(overrides: Partial<PunchCardInput> = {}): PunchCardInput {
  return {
    students: [
      { id: "stu-1", firstName: "Nora", lastName: "Kim", dateOfBirth: "2017-10-01", camperId: "camper-1" },
      { id: "stu-2", firstName: "Sam", lastName: "Kim", dateOfBirth: "2019-01-01" },
    ],
    linkEmail: "kim@example.com",
    campers: [
      { id: "camper-1", name: "Nora Kim", familyId: "wf-1", birthdate: "2017-10-01", dayCredits: 3, snowCredits: 2 },
    ],
    families: [{ id: "wf-1", email: "kim@example.com", ccEmail: "dad@example.com", parentName: "Jo Kim" }],
    catalog: [
      { id: 1, name: "Ages 5–9 Day Camp · Sep 21, 2026", ageRange: "5 – 9 yrs", startsOn: "2026-09-21", offeringKind: "day_camp", priceCents: 7900, remaining: 12, bookable: true, description: null },
      { id: 2, name: "Heroes & Villains", ageRange: "9 – 12 yrs", startsOn: "2026-09-21", offeringKind: "day_camp", priceCents: 7900, remaining: 0, bookable: true, description: null },
      { id: 3, name: "Ages 5–9 Day Camp · Oct 12, 2026", ageRange: "5 – 9 yrs", startsOn: "2026-10-12", offeringKind: "day_camp", priceCents: 7900, remaining: 40, bookable: true, description: null },
      { id: 4, name: "Improv Olympics", ageRange: "9 – 12 yrs", startsOn: "2026-10-12", offeringKind: "day_camp", priceCents: 7900, remaining: 30, bookable: true, description: null },
      { id: 990010, name: "Day Camp Pack", ageRange: null, startsOn: null, offeringKind: "pack", priceCents: 34900, remaining: null, bookable: true, description: null },
    ],
    orderItems: [
      { id: "oi-1", orderId: "o-1", activityId: 3, camperName: "Nora Kim", unitPriceCents: 0, orderEmail: "DAD@example.com", orderStatus: "paid", createdAt: "2026-09-03T14:00:00.000Z" },
      { id: "oi-2", orderId: "o-2", activityId: 990010, camperName: "Nora Kim", unitPriceCents: 34900, orderEmail: "kim@example.com", orderStatus: "paid", createdAt: "2026-09-03T13:00:00.000Z" },
      // Somebody else's child under the same name in another household: never ours.
      { id: "oi-3", orderId: "o-3", activityId: 1, camperName: "Nora Kim", unitPriceCents: 7900, orderEmail: "other@example.com", orderStatus: "paid", createdAt: "2026-09-03T13:00:00.000Z" },
      // A refunded order is not a booking.
      { id: "oi-4", orderId: "o-4", activityId: 1, camperName: "Nora Kim", unitPriceCents: 7900, orderEmail: "kim@example.com", orderStatus: "refunded", createdAt: "2026-09-03T13:00:00.000Z" },
    ],
    creditEvents: [
      { paymentIntent: "pi_1", email: "kim@example.com", createdAt: "2026-09-03T13:00:00.000Z", detail: { grants: [{ camper: "Nora Kim", day: 5, snow: 2 }], redemptions: [] } },
      { paymentIntent: "free_abc", email: "dad@example.com", createdAt: "2026-09-03T14:00:00.000Z", detail: { grants: [], redemptions: [{ camper: "nora kim", day: 1, snow: 0 }] } },
    ],
    ...overrides,
  };
}

describe("assemblePunchCards", () => {
  const now = new Date("2026-09-13T15:00:00Z");

  it("defaults the band per date, so a birthday between two dates moves the child up", () => {
    const board = assemblePunchCards(inputWith(), { now });
    const nora = board.cards[0];
    const sep21 = nora.days.find((d) => d.date === "2026-09-21")!;
    const oct12 = nora.days.find((d) => d.date === "2026-10-12")!;
    // Eight on Sep 21: little kids. Nine on Oct 12: still 5–9 by default, 9–12 offered.
    expect(sep21.sessions.find((s) => s.isDefaultBand)?.band?.key).toBe("5-9");
    expect(sep21.sessions.find((s) => s.band?.key === "9-12")?.isOffered).toBe(false);
    expect(oct12.sessions.find((s) => s.isDefaultBand)?.band?.key).toBe("5-9");
    expect(oct12.sessions.find((s) => s.band?.key === "9-12")?.isOffered).toBe(true);
  });

  it("locks a booked day and says how it was bought, inside the household only", () => {
    const board = assemblePunchCards(inputWith(), { now });
    const nora = board.cards[0];
    const oct12 = nora.days.find((d) => d.date === "2026-10-12")!;
    expect(oct12.booked).toMatchObject({ activityId: 3, viaCredit: true, orderNo: "o-1" });
    // The other household's Nora, and the refunded order, leave Sep 21 open.
    const sep21 = nora.days.find((d) => d.date === "2026-09-21")!;
    expect(sep21.booked).toBeUndefined();
    expect(sep21.full).toBe(false);
    expect(nora.credits).toEqual({ day: 3, snow: 2 });
    expect(nora.packsBought).toEqual([{ name: "Day Camp Pack", on: "2026-09-03T13:00:00.000Z", credits: 5 }]);
    expect(nora.camper?.email).toBe("kim@example.com");
  });

  it("reads the ledger by the camper's name, case-insensitively", () => {
    const board = assemblePunchCards(inputWith(), { now });
    const ledger = board.cards[0].ledger;
    expect(ledger.map((l) => [l.kind, l.day, l.snow])).toEqual([
      ["grant", 5, 2],
      ["redemption", 1, 0],
    ]);
    expect(ledger[1].what).toBe("Ages 5–9 Day Camp · Oct 12, 2026");
  });

  it("gives a child with no camper a card with no actions", () => {
    const board = assemblePunchCards(inputWith(), { now });
    const sam = board.cards[1];
    expect(sam.camper).toBeNull();
    expect(sam.days).toEqual([]);
    expect(sam.credits).toEqual({ day: 0, snow: 0 });
  });

  it("marks past dates and a date where every session is full", () => {
    const board = assemblePunchCards(
      inputWith({
        catalog: [
          { id: 1, name: "A", ageRange: "5 – 9 yrs", startsOn: "2026-09-01", offeringKind: "day_camp", priceCents: 7900, remaining: 5, bookable: true, description: null },
          { id: 2, name: "B", ageRange: "5 – 9 yrs", startsOn: "2026-10-12", offeringKind: "day_camp", priceCents: 7900, remaining: 0, bookable: true, description: null },
          { id: 3, name: "C", ageRange: "9 – 12 yrs", startsOn: "2026-10-12", offeringKind: "day_camp", priceCents: 7900, remaining: 3, bookable: false, description: null },
        ],
        orderItems: [],
      }),
      { now }
    );
    const [past, full] = board.cards[0].days;
    expect(past).toMatchObject({ date: "2026-09-01", past: true });
    expect(full).toMatchObject({ date: "2026-10-12", full: true, past: false });
  });

  it("still lists a booked day whose listing has left the catalog", () => {
    const board = assemblePunchCards(
      inputWith({
        catalog: [
          { id: 3, name: "Ages 5–9 Day Camp · Oct 12, 2026", ageRange: "5 – 9 yrs", startsOn: "2026-10-12", offeringKind: "day_camp", priceCents: 7900, remaining: 0, bookable: false, description: null },
        ],
      }),
      { now }
    );
    const day = board.cards[0].days.find((d) => d.date === "2026-10-12")!;
    expect(day.booked?.activityId).toBe(3);
    expect(day.full).toBe(false); // booked is not full
  });
});

/* ── the three-state loader ───────────────────────────────────────────── */

describe("fetchPunchCards", () => {
  beforeEach(() => {
    resetMockPunchCards();
    vi.unstubAllEnvs();
  });

  it("answers unavailable, never zero credits, when the registration read fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    // No NEXT_PUBLIC_SUPABASE_URL in tests: the live reader returns null.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const board = await fetchPunchCards("some-family");
    expect(board.status).toBe("unavailable");
    expect(board.cards).toEqual([]);
  });

  it("answers the fixtures in mock mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    const board = await fetchPunchCards("fam-martinez");
    expect(board.status).toBe("ok");
    const ava = board.cards.find((c) => c.student.id === "stu-ava")!;
    expect(ava.credits.day).toBe(3);
    expect(ava.days.filter((d) => d.booked)).toHaveLength(2);
    expect(ava.days).toHaveLength(21);
    const leo = board.cards.find((c) => c.student.id === "stu-leo")!;
    expect(leo.camper).toBeNull();
  });
});

/* ── booking twice ────────────────────────────────────────────────────── */

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => ({
    id: "user-sofia",
    email: "sofia@example.com",
    displayName: "Sofia Martinez",
    role: "parent",
    familyId: "fam-martinez",
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

describe("bookWithCreditsAction (mock mode)", () => {
  beforeEach(() => {
    resetMockPunchCards();
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
  });

  it("books once, then refuses the same day as already booked without touching the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { bookWithCreditsAction } = await import("@/lib/actions/day-camps");
    const before = mockPunchCardInput("fam-martinez")!;
    const open = before.catalog.find((a) => a.startsOn === "2026-11-09" && a.ageRange === "9 – 12 yrs")!;

    const first = await bookWithCreditsAction({ studentId: "stu-ava", activityIds: [open.id] });
    expect(first.ok).toBe(true);
    expect(first.creditsLeft).toBe(2);

    const again = await bookWithCreditsAction({ studentId: "stu-ava", activityIds: [open.id] });
    expect(again.ok).toBe(false);
    expect(again.message).toMatch(/already booked/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("refuses more days than credits, a full session, and a child with no camper", async () => {
    const { bookWithCreditsAction } = await import("@/lib/actions/day-camps");
    const input = mockPunchCardInput("fam-martinez")!;
    const open = input.catalog.filter((a) => a.offeringKind === "day_camp" && a.ageRange === "9 – 12 yrs" && (a.remaining ?? 1) > 0 && !["2026-09-21", "2026-11-02"].includes(a.startsOn!));
    const four = await bookWithCreditsAction({ studentId: "stu-ava", activityIds: open.slice(0, 4).map((a) => a.id) });
    expect(four.ok).toBe(false);
    expect(four.message).toMatch(/3 credits left/);

    const full = input.catalog.find((a) => a.startsOn === "2026-11-11" && a.ageRange === "9 – 12 yrs")!;
    const fullResult = await bookWithCreditsAction({ studentId: "stu-ava", activityIds: [full.id] });
    expect(fullResult.ok).toBe(false);
    expect(fullResult.message).toMatch(/full/);

    const leo = await bookWithCreditsAction({ studentId: "stu-leo", activityIds: [open[0].id] });
    expect(leo.ok).toBe(false);
    expect(leo.message).toMatch(/can't find Leo/);
  });

  it("refuses one child on two sessions of the same day", async () => {
    const { bookWithCreditsAction } = await import("@/lib/actions/day-camps");
    const input = mockPunchCardInput("fam-martinez")!;
    const [a, b] = input.catalog.filter((x) => x.startsOn === "2027-01-25");
    const result = await bookWithCreditsAction({ studentId: "stu-ava", activityIds: [a.id, b.id] });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/one session per day/);
  });

  it("hands a paid cart to the website with the child and the days named", async () => {
    const { checkoutDayCampsAction } = await import("@/lib/actions/day-camps");
    const input = mockPunchCardInput("fam-martinez")!;
    const day = input.catalog.find((a) => a.startsOn === "2027-02-05" && a.ageRange === "9 – 12 yrs")!;
    const result = await checkoutDayCampsAction({ studentId: "stu-ava", activityIds: [day.id], packId: 990010 });
    expect(result.ok).toBe(true);
    const url = new URL(result.url!);
    expect(url.searchParams.get("activity")).toBe(`${day.id},990010`);
    expect(url.searchParams.get("kid")).toBe("Ava Martinez");
    expect(url.searchParams.get("pe")).toBe("sofia@example.com");
    expect(url.searchParams.get("back")).toBe("portal");
  });
});

/* ── the sync retracts what the source retracts ───────────────────────── */

describe("reconcile and day camps", () => {
  const student: Student = {
    id: "stu-1", familyId: "fam-1", firstName: "Amalea", lastName: "Saxena", dateOfBirth: "2018-01-01",
    grade: "2", consents: { photoUse: false, faceMatching: false, directoryVisible: false },
    resumeCredits: [], hasLogin: false, createdAt: "", updatedAt: "",
  };
  const dayCamp: Production = { id: "prod-oct12", programId: "p", title: "Ages 5–9 Day Camp · Oct 12, 2026", seasonId: "s", venue: "", registrationActivityId: 1962599 };
  const disney: Production = { id: "prod-disney", programId: "p", title: "Disney Adventures Camp", seasonId: "s", venue: "" };
  const base = (): ReconcileInput => ({
    snapshot: { source: "website", fetchedAt: "2026-09-13T00:00:00Z", accounts: [{ externalId: "wf-1", source: "website", guardianName: "S", email: "s@example.com" }], participants: [{ externalId: "c-1", accountExternalId: "wf-1", firstName: "Amalea", lastName: "Saxena" }], enrollments: [] },
    families: [{ id: "fam-1", name: "Saxena", createdAt: "", updatedAt: "" } as never],
    guardians: [{ id: "g", familyId: "fam-1", fullName: "S", email: "s@example.com", relationship: "", isPrimary: true } as never],
    students: [student],
    enrollments: [],
    productions: [dayCamp, disney],
    classes: [],
    links: [{ familyId: "fam-1", source: "website", externalId: "wf-1", externalEmail: "s@example.com", linkedAt: "", autoMatched: true }],
  });

  it("never places a legacy row on a day camp", () => {
    const input = base();
    input.snapshot.enrollments.push({
      externalId: "legacy:424", source: "website", participantExternalId: "c-1", accountExternalId: "wf-1",
      offeringName: "Ages 5–9 Day Camp · Oct 12, 2026", offeringCategory: "camp", offeringKind: "day_camp",
      offeringActivityId: 1962599, status: "enrolled", balanceCents: 0, amountPaidCents: 0, enrolledAt: "2026-09-05T15:45:00Z",
    });
    const plan = reconcile(input);
    expect(plan.creates).toEqual([]);
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0]).toMatchObject({ kind: "unknown_offering", externalId: "legacy:424" });
    expect(plan.issues[0].message).toMatch(/legacy/i);
    expect(plan.issues[0].message).toMatch(/order_items/);
  });

  it("withdraws the old enrollment when a legacy row loses its day-camp activity id", () => {
    const input = base();
    const stale: Enrollment = { id: "enr-stale", studentId: "stu-1", productionId: "prod-oct12", status: "enrolled", balanceCents: 0, source: "registration_portal", createdAt: "" };
    input.enrollments = [stale];
    input.enrollmentExternalIds = new Map([["enr-stale", "legacy:424"]]);
    // The row now carries only its free text, which resolves by name to the July camp.
    input.snapshot.enrollments.push({
      externalId: "legacy:424", source: "website", participantExternalId: "c-1", accountExternalId: "wf-1",
      offeringName: "Disney Adventures Camp", offeringCategory: "camp", status: "enrolled", balanceCents: 0, amountPaidCents: 0, enrolledAt: "2026-09-05T15:45:00Z",
    });
    const plan = reconcile(input);
    expect(plan.updates).toContainEqual({ enrollmentId: "enr-stale", status: "withdrawn" });
    expect(plan.creates.map((c) => c.productionId)).toEqual(["prod-disney"]);
    expect(plan.issues.some((i) => i.kind === "conflict" && /enr-stale/.test(i.message))).toBe(true);
  });

  it("withdraws when the source now resolves to nothing, but only for an id-matched row", () => {
    const input = base();
    input.enrollments = [
      { id: "enr-id", studentId: "stu-1", productionId: "prod-oct12", status: "enrolled", balanceCents: 0, source: "registration_portal", createdAt: "" },
      { id: "enr-name", studentId: "stu-1", productionId: "prod-disney", status: "enrolled", balanceCents: 0, source: "registration_portal", createdAt: "" },
    ];
    input.enrollmentExternalIds = new Map([["enr-id", "legacy:1"], ["enr-name", "legacy:2"]]);
    input.snapshot.enrollments.push(
      { externalId: "legacy:1", source: "website", participantExternalId: "c-1", accountExternalId: "wf-1", offeringName: "Something gone", offeringCategory: "camp", status: "enrolled", balanceCents: 0, amountPaidCents: 0, enrolledAt: "" },
      { externalId: "legacy:2", source: "website", participantExternalId: "c-1", accountExternalId: "wf-1", offeringName: "Disney Adventures Camp (renamed)", offeringCategory: "camp", status: "enrolled", balanceCents: 0, amountPaidCents: 0, enrolledAt: "" }
    );
    const plan = reconcile(input);
    expect(plan.updates).toContainEqual({ enrollmentId: "enr-id", status: "withdrawn" });
    expect(plan.updates.find((u) => u.enrollmentId === "enr-name")).toBeUndefined();
    expect(plan.issues.filter((i) => i.kind === "unknown_offering")).toHaveLength(2);
  });

  it("is a no-op on a second run over the same rows", () => {
    const input = base();
    input.snapshot.enrollments.push({
      externalId: "oi-1", source: "website", participantExternalId: "c-1", accountExternalId: "wf-1",
      offeringName: "Ages 5–9 Day Camp · Oct 12, 2026", offeringCategory: "camp", offeringKind: "day_camp",
      offeringActivityId: 1962599, status: "enrolled", balanceCents: 0, amountPaidCents: 0, enrolledAt: "",
    });
    input.enrollments = [{ id: "enr-1", studentId: "stu-1", productionId: "prod-oct12", status: "enrolled", balanceCents: 0, source: "registration_portal", amountPaidCents: 0, offeringCategory: "camp", createdAt: "" }];
    input.enrollmentExternalIds = new Map([["enr-1", "oi-1"]]);
    const plan = reconcile(input);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
  });
});

/* ── the FSA statement ────────────────────────────────────────────────── */

describe("Dependent Care FSA statement and the punch card", () => {
  const student: Student = {
    id: "stu-eva", familyId: "fam-1", firstName: "Eva", lastName: "Pruitt", dateOfBirth: "2016-02-14",
    grade: "5", consents: { photoUse: false, faceMatching: false, directoryVisible: false },
    resumeCredits: [], hasLogin: false, createdAt: "", updatedAt: "",
  };
  const productions: Production[] = [
    { id: "prod-pack", programId: "p", title: "Day Camp Pack", seasonId: "s", venue: "", registrationActivityId: 990010 },
    { id: "prod-nov2", programId: "p", title: "Improv Olympics", seasonId: "s", venue: "", registrationActivityId: 991108 },
    { id: "prod-nov3", programId: "p", title: "Campaign Trail: The Musical", seasonId: "s", venue: "", registrationActivityId: 1962622 },
  ];
  const enrollment = (id: string, productionId: string, paid: number, on?: string): Enrollment => ({
    id, studentId: "stu-eva", productionId, status: "enrolled", balanceCents: 0, source: "registration_portal",
    offeringCategory: "camp", amountPaidCents: paid, sessionStartsOn: on, sessionEndsOn: on, createdAt: "",
  });
  const base = {
    student,
    family: { id: "fam-1", name: "Pruitt", createdAt: "", updatedAt: "" } as never,
    guardians: [{ id: "g", familyId: "fam-1", fullName: "Ginny Pruitt", email: "g@example.com", relationship: "", isPrimary: true } as never],
    classes: [],
    productions,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
  };

  it("puts the pack's money on the pack line, dated by the days its credits bought", async () => {
    const { buildFsaStatement } = await import("@/lib/api/documents/fsa");
    const statement = buildFsaStatement({
      ...base,
      enrollments: [
        enrollment("e-pack", "prod-pack", 34900),
        enrollment("e-nov2", "prod-nov2", 0, "2026-11-02"),
        enrollment("e-nov3", "prod-nov3", 0, "2026-11-03"),
      ],
    });
    expect(statement.eligible).toBe(true);
    expect(statement.totalCents).toBe(34900);
    const pack = statement.lineItems.find((l) => l.description.startsWith("Day Camp Pack"))!;
    expect(pack).toMatchObject({ startDate: "2026-11-02", endDate: "2026-11-03", amountCents: 34900, datesApproximate: false });
    expect(pack.note).toMatch(/2 days of camp/);
    const day = statement.lineItems.find((l) => l.description === "Improv Olympics")!;
    expect(day.amountCents).toBe(0);
    expect(day.note).toMatch(/Day Camp Pack credit/);
    expect(statement.unpricedCount).toBe(0);
  });

  it("a pack with no credits used yet is dated by the plan year and says so", async () => {
    const { buildFsaStatement } = await import("@/lib/api/documents/fsa");
    const statement = buildFsaStatement({ ...base, enrollments: [enrollment("e-pack", "prod-pack", 34900)] });
    const pack = statement.lineItems[0];
    expect(pack).toMatchObject({ startDate: "2026-01-01", endDate: "2026-12-31", datesApproximate: true });
    expect(pack.note).toMatch(/No credits have been used/);
  });

  it("a day paid for outright is a normal dated line", async () => {
    const { buildFsaStatement } = await import("@/lib/api/documents/fsa");
    const statement = buildFsaStatement({ ...base, enrollments: [enrollment("e-nov2", "prod-nov2", 7900, "2026-11-02")] });
    expect(statement.lineItems[0]).toMatchObject({ amountCents: 7900, startDate: "2026-11-02", datesApproximate: false });
    expect(statement.lineItems[0].note).toBeUndefined();
    expect(statement.eligible).toBe(true);
  });

  it("a thirteen-year-old with day camps is not eligible", async () => {
    const { buildFsaStatement } = await import("@/lib/api/documents/fsa");
    const statement = buildFsaStatement({
      ...base,
      student: { ...student, dateOfBirth: "2013-04-30" },
      enrollments: [enrollment("e-nov2", "prod-nov2", 7900, "2026-11-02")],
    });
    expect(statement.eligible).toBe(false);
    expect(statement.ineligibleReason).toMatch(/under 13/);
  });
});
