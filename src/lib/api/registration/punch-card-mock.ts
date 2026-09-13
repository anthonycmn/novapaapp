import { students as seedStudents } from "../mock/seed-data";
import type {
  PunchCardInput,
  PunchCardStudent,
  RawActivity,
  RawCreditEvent,
  RawOrderItem,
} from "./punch-card";

/**
 * The punch card in mock mode: the real 2026–27 calendar (21 dates × 3 bands,
 * the same names and ids as the live catalog), invented families.
 *
 * Fixtures, per the build spec: Ava Martinez holds 3 credits from a 5-pack
 * and has two days booked — one paid on Aug 24, one spent from the pack on
 * Sep 3 — so the card shows a locked paid row, a locked credited row, a
 * balance and a ledger. Leo Martinez is a hub student with no camper link,
 * so his card is the "we can't find Leo in the registration system" case.
 * Two sessions are full and one is past, so every row state is on screen.
 *
 * The store is module-level and mutable: `mockBookWithCredits` is what the
 * redeem action calls in mock mode instead of the network, and it does what
 * the registration system would — writes a $0 order line and a redemption
 * event, and takes the credits off the camper.
 */

const DATES = [
  "2026-09-21", "2026-10-12", "2026-10-29", "2026-10-30", "2026-11-02", "2026-11-03",
  "2026-11-09", "2026-11-11", "2027-01-18", "2027-01-25", "2027-02-05", "2027-02-15",
  "2027-03-08", "2027-03-09", "2027-03-10", "2027-03-22", "2027-03-23", "2027-03-24",
  "2027-03-25", "2027-03-26", "2027-04-12",
];

/** The themed names the 9–12 and 12–15 rows carry, by date — the real ones repeat across dates. */
const THEMES: Record<string, [string, string]> = {
  "2026-09-21": ["Heroes & Villains", "Heroes & Villains"],
  "2026-10-12": ["Improv Olympics", "Scene Study Lab"],
  "2026-10-29": ["Fall Theatre Intensive", "Fall Theatre Intensive"],
  "2026-10-30": ["Fall Theatre Intensive", "Fall Theatre Intensive"],
  "2026-11-02": ["Improv Olympics", "Fall Theatre Intensive"],
  "2026-11-03": ["Campaign Trail: The Musical", "Campaign Trail: The Musical"],
  "2026-11-09": ["Stage Combat Basics", "Stage Combat Basics"],
  "2026-11-11": ["Veterans Day Revue", "Veterans Day Revue"],
  "2027-01-18": ["Dream Big: A Day of Story", "Dream Big: A Day of Story"],
  "2027-01-25": ["Winter Improv", "Winter Improv"],
  "2027-02-05": ["Musical Theatre Dance Day", "Musical Theatre Dance Day"],
  "2027-02-15": ["History Set to Music", "History Set to Music"],
  "2027-03-08": ["Spring Break Musical Theatre Camp", "Spring Break Musical Theatre Camp"],
  "2027-03-09": ["Spring Break Musical Theatre Camp", "Spring Break Musical Theatre Camp"],
  "2027-03-10": ["Spring Break Musical Theatre Camp", "Spring Break Musical Theatre Camp"],
  "2027-03-22": ["Spring Break Musical Theatre Camp", "Spring Break Musical Theatre Camp"],
  "2027-03-23": ["Spring Break Musical Theatre Camp", "Spring Break Musical Theatre Camp"],
  "2027-03-24": ["Spring Break Musical Theatre Camp", "Spring Break Musical Theatre Camp"],
  "2027-03-25": ["Spring Break Musical Theatre Camp", "Spring Break Musical Theatre Camp"],
  "2027-03-26": ["Spring Break Musical Theatre Camp", "Spring Break Musical Theatre Camp"],
  "2027-04-12": ["Improv Olympics", "Audition Bootcamp"],
};

const LONG_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function buildCatalog(): RawActivity[] {
  const rows: RawActivity[] = [];
  DATES.forEach((date, i) => {
    const base = 991100 + i * 3;
    const [mid, teen] = THEMES[date];
    const long = LONG_DATE.format(new Date(`${date}T12:00:00Z`));
    rows.push({
      id: base,
      name: date === "2026-09-21" ? "Heroes & Villains" : `Ages 5–9 Day Camp · ${long}`,
      ageRange: "5 – 9 yrs",
      startsOn: date,
      offeringKind: "day_camp",
      priceCents: 7900,
      // One full little-kids session, so the "Full" state renders.
      remaining: date === "2026-10-12" ? 0 : 40 - ((i * 7) % 23),
      bookable: true,
      description: "No school: Loudoun County",
    });
    rows.push({
      id: base + 1,
      name: mid,
      ageRange: "9 – 12 yrs",
      startsOn: date,
      offeringKind: "day_camp",
      priceCents: 7900,
      remaining: date === "2026-11-11" ? 0 : 30 - ((i * 5) % 19),
      bookable: true,
      description: "No school: Fairfax County",
    });
    rows.push({
      id: base + 2,
      name: teen,
      ageRange: "12 – 15 yrs",
      startsOn: date,
      offeringKind: "day_camp",
      priceCents: 7900,
      remaining: 30 - ((i * 3) % 11),
      bookable: true,
      description: null,
    });
  });
  rows.push({ id: 990010, name: "Day Camp Pack", ageRange: null, startsOn: null, offeringKind: "pack", priceCents: 34900, remaining: null, bookable: true, description: null });
  rows.push({ id: 990011, name: "Day Camp 10-Pack", ageRange: null, startsOn: null, offeringKind: "pack", priceCents: 67500, remaining: null, bookable: true, description: null });
  return rows;
}

export const MOCK_AVA_CAMPER_ID = "camper-ava";
const MOCK_FAMILY_EMAIL = "sofia@example.com";

interface MockStore {
  camperCredits: Record<string, { day: number; snow: number }>;
  orderItems: RawOrderItem[];
  creditEvents: RawCreditEvent[];
  catalog: RawActivity[];
}

/*
 * Off globalThis, like the mock provider's own store: Next bundles a page's
 * server components and its server actions into separate module graphs, so
 * a module-level variable here would be one store for the page and another
 * for the action, and a booking made by the action would never show.
 */
const mockGlobal = globalThis as typeof globalThis & { __novapaPunchCardMock?: MockStore | null };

function ensureStore(): MockStore {
  if (mockGlobal.__novapaPunchCardMock) return mockGlobal.__novapaPunchCardMock;
  const catalog = buildCatalog();
  const sep21 = catalog.find((a) => a.startsOn === "2026-09-21" && a.ageRange === "9 – 12 yrs")!;
  const nov2 = catalog.find((a) => a.startsOn === "2026-11-02" && a.ageRange === "9 – 12 yrs")!;
  const store: MockStore = {
    camperCredits: { [MOCK_AVA_CAMPER_ID]: { day: 3, snow: 2 } },
    orderItems: [
      { id: "oi-ava-pack", orderId: "ord-1002", activityId: 990010, camperName: "Ava Martinez", unitPriceCents: 34900, orderEmail: MOCK_FAMILY_EMAIL, orderStatus: "paid", createdAt: "2026-09-03T14:02:00.000Z" },
      { id: "oi-ava-sep21", orderId: "ord-1001", activityId: sep21.id, camperName: "Ava Martinez", unitPriceCents: 7900, orderEmail: MOCK_FAMILY_EMAIL, orderStatus: "paid", createdAt: "2026-08-24T16:40:00.000Z" },
      { id: "oi-ava-nov2", orderId: "ord-1003", activityId: nov2.id, camperName: "Ava Martinez", unitPriceCents: 0, orderEmail: MOCK_FAMILY_EMAIL, orderStatus: "paid", createdAt: "2026-09-03T14:10:00.000Z" },
    ],
    creditEvents: [
      { paymentIntent: "pi_mock_pack", email: MOCK_FAMILY_EMAIL, createdAt: "2026-09-03T14:02:00.000Z", detail: { grants: [{ camper: "Ava Martinez", day: 5, snow: 2 }], redemptions: [] } },
      { paymentIntent: "free_mock_nov2", email: MOCK_FAMILY_EMAIL, createdAt: "2026-09-03T14:10:00.000Z", detail: { grants: [], redemptions: [{ camper: "Ava Martinez", day: 1, snow: 0 }] } },
      { paymentIntent: "repair_mock", email: MOCK_FAMILY_EMAIL, createdAt: "2026-09-13T21:40:00.000Z", detail: { grants: [], redemptions: [{ camper: "Ava Martinez", day: 1, snow: 0 }], source: "credit_repair", note: "A redemption the checkout keyed by cart position." } },
    ],
    catalog,
  };
  mockGlobal.__novapaPunchCardMock = store;
  return store;
}

/** Test seam: back to the fixtures. */
export function resetMockPunchCards(): void {
  mockGlobal.__novapaPunchCardMock = null;
}

export function mockPunchCardInput(familyId: string): PunchCardInput | null {
  const s = ensureStore();
  const students: PunchCardStudent[] = seedStudents
    .filter((st) => st.familyId === familyId)
    .map((st) => ({
      id: st.id,
      firstName: st.firstName,
      lastName: st.lastName,
      preferredName: st.preferredName,
      dateOfBirth: st.dateOfBirth,
      // Ava is linked; every other seed child is the "no camper" case.
      camperId: st.id === "stu-ava" ? MOCK_AVA_CAMPER_ID : undefined,
    }));
  const credits = s.camperCredits[MOCK_AVA_CAMPER_ID];
  return {
    students,
    linkEmail: familyId === "fam-martinez" ? MOCK_FAMILY_EMAIL : null,
    campers: [
      { id: MOCK_AVA_CAMPER_ID, name: "Ava Martinez", familyId: "web-fam-martinez", birthdate: "2015-03-12", dayCredits: credits.day, snowCredits: credits.snow },
    ],
    families: [{ id: "web-fam-martinez", email: MOCK_FAMILY_EMAIL, ccEmail: null, parentName: "Sofia Martinez" }],
    catalog: s.catalog,
    orderItems: s.orderItems,
    creditEvents: s.creditEvents,
  };
}

/**
 * What the registration system would do with a confirmed $0 order: one
 * order_items line per day at $0, one redemption event naming the camper, and
 * the balance down by the count. Returns the order_item ids, like the live
 * path reports back.
 */
export function mockBookWithCredits(camperId: string, activityIds: number[]): { orderItemIds: string[] } {
  const s = ensureStore();
  const credits = s.camperCredits[camperId];
  if (!credits) throw new Error("mock: no such camper");
  if (activityIds.length > credits.day) throw new Error("mock: not enough credits");
  const now = new Date().toISOString();
  const orderId = `ord-mock-${Date.now()}`;
  const ids: string[] = [];
  for (const activityId of activityIds) {
    const activity = s.catalog.find((a) => a.id === activityId);
    if (!activity || activity.remaining === 0) throw new Error(`SOLD_OUT_ACTIVITY:${activityId}`);
    const id = `oi-mock-${activityId}-${Date.now()}`;
    ids.push(id);
    s.orderItems.push({
      id,
      orderId,
      activityId,
      camperName: "Ava Martinez",
      unitPriceCents: 0,
      orderEmail: MOCK_FAMILY_EMAIL,
      orderStatus: "paid",
      createdAt: now,
    });
    if (activity.remaining != null) activity.remaining -= 1;
  }
  credits.day -= activityIds.length;
  s.creditEvents.push({
    paymentIntent: `free_${orderId}`,
    email: MOCK_FAMILY_EMAIL,
    createdAt: now,
    detail: { grants: [], redemptions: [{ camper: "Ava Martinez", day: activityIds.length, snow: 0 }] },
  });
  return { orderItemIds: ids };
}
