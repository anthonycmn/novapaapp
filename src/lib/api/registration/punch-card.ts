import { cache } from "react";
import {
  DAY_CAMP_PACKS,
  DAY_CAMP_PRICE_CENTS,
  type AgeBand,
  ageOn,
  bandChoiceForAge,
  isDayCampPack,
  parseAgeBand,
  snowBonusOpen,
} from "@/config/day-camps";
import { todayKey } from "@/lib/calendar/week";

/**
 * The Day Camp Punch Card — one per child, read live out of the registration
 * system and never copied.
 *
 * CJ, 13 Sep 2026: "I want a DAY CAMP PUNCHCARD line in the navigation with
 * all of the dates listed, and then they can assign their credits based on
 * what they bought to the days… If they purchased a specific day — show that
 * and do not let them change."
 *
 * ONE SOURCE OF TRUTH, THREE READERS. Credits live on `public.campers`
 * (day_camp_credits / snow_day_credits) with `public.credit_events` as the
 * ledger; a booked day is a `public.order_items` row on a paid order; the
 * dates are `public.activities` with offering_kind = 'day_camp'. The website
 * prices and books against those rows, the staff portal's rosters read the
 * same order_items live, and this card reads them too. Nothing is mirrored
 * into family_hub, so nothing can disagree — the balance a parent sees here
 * is the balance the checkout will honor, by construction.
 *
 * WHAT THIS MODULE IS. The pure assembly: given the rows, build the cards.
 * No I/O, so the mock provider and the live reader produce identical shapes
 * and the tests exercise the real logic. `punch-card-live.ts` fetches the
 * rows from the shared database; `punch-card-mock.ts` invents them.
 *
 * The child is joined to the register by `students.camper_id` and nothing
 * else — never by name. Duplicate children exist on both sides (Cullen
 * Skelton is two campers in two families), and a name match would hand one
 * household the other's credits.
 *
 * Bookings come from `order_items` only, never `legacy_enrollments`. The
 * Sawyer-era import once put ten July Disney campers on the Oct 12 day camp
 * (6b); a legacy row can never reach this card, so it could not show that
 * even while the hub still held the stale enrollments.
 */

/* ── shapes ─────────────────────────────────────────────────────────────── */

export interface PunchCardStudent {
  id: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  dateOfBirth?: string;
  /** `students.camper_id` — the only join to the register. */
  camperId?: string;
}

export interface PunchCardSession {
  activityId: number;
  name: string;
  band: AgeBand | null;
  /** The website's own spots-left figure (net of sold, offline and holds); null = uncapped. */
  remaining: number | null;
  bookable: boolean;
  /** The band the child's age lands on for this date. */
  isDefaultBand: boolean;
  /** Offered beside the default when the age straddles a band, or when there is no default. */
  isOffered: boolean;
  description?: string;
}

export interface PunchCardBooking {
  activityId: number;
  name: string;
  band: AgeBand | null;
  /** ISO timestamp the order was placed. */
  on: string;
  /** unit_price_cents = 0: booked with a credit. */
  viaCredit: boolean;
  /** The order id, for "order …" on the row. */
  orderNo: string;
  /** The order_items row — the enrollment's external_id in the hub. */
  orderItemId: string;
}

export interface PunchCardDay {
  /** yyyy-MM-dd */
  date: string;
  /** Mon, Sep 21 */
  label: string;
  sessions: PunchCardSession[];
  booked?: PunchCardBooking;
  past: boolean;
  /** Every session full or unbookable, and nothing booked. */
  full: boolean;
}

export interface PunchCardLedgerLine {
  on: string;
  kind: "grant" | "redemption";
  day: number;
  snow: number;
  /** "Day Camp Pack", "Improv Olympics", "credit repair" — what it was for. */
  what: string;
}

export interface PunchCard {
  student: PunchCardStudent;
  /** Null when the child is not linked to a camper — the card explains, and offers no actions. */
  camper: { id: string; name: string; email: string; parentName: string | null } | null;
  credits: { day: number; snow: number };
  packsBought: { name: string; on: string; credits: number }[];
  days: PunchCardDay[];
  ledger: PunchCardLedgerLine[];
  /** Said when the child's age lands outside every band, or has no birthday. */
  ageNote?: string;
  /** Whole years old today, for the header. */
  age: number | null;
}

/**
 * What the page renders. `status` is the three-state rule billing.ts keeps:
 * "ok" is a verified read (an empty list of cards means no children);
 * "unavailable" means the registration system could not be read and the
 * page must claim nothing — not zero credits, not an empty calendar.
 */
export interface PunchCardBoard {
  status: "ok" | "unavailable";
  cards: PunchCard[];
  snowBonusOpen: boolean;
  /** The two credit packs, as the catalog sells them today. */
  packs: { activityId: number; name: string; credits: number; cents: number; bookable: boolean }[];
  dayPriceCents: number;
}

/* ── raw rows, as the two sources hand them over ────────────────────────── */

export interface RawCamper {
  id: string;
  name: string;
  familyId: string;
  birthdate: string | null;
  dayCredits: number;
  snowCredits: number;
}

export interface RawFamily {
  id: string;
  email: string;
  ccEmail: string | null;
  parentName: string | null;
}

/** One `catalog_list()` row we care about, or an `activities` row for a booked day the catalog no longer lists. */
export interface RawActivity {
  id: number;
  name: string;
  ageRange: string | null;
  startsOn: string | null;
  offeringKind: string | null;
  priceCents: number | null;
  remaining: number | null;
  bookable: boolean;
  description: string | null;
}

export interface RawOrderItem {
  id: string;
  orderId: string;
  activityId: number | null;
  camperName: string | null;
  unitPriceCents: number;
  orderEmail: string;
  orderStatus: string;
  createdAt: string;
}

export interface RawCreditEvent {
  paymentIntent: string;
  email: string;
  createdAt: string;
  detail: {
    grants?: { camper?: string; day?: number; snow?: number }[];
    redemptions?: { camper?: string; day?: number; snow?: number }[];
    source?: string;
    note?: string;
  } | null;
}

export interface PunchCardInput {
  students: PunchCardStudent[];
  /** The hub link's email, one more address the household's orders may sit under. */
  linkEmail: string | null;
  campers: RawCamper[];
  families: RawFamily[];
  catalog: RawActivity[];
  orderItems: RawOrderItem[];
  creditEvents: RawCreditEvent[];
}

/* ── assembly ───────────────────────────────────────────────────────────── */

/** Statuses the registration system itself treats as a live booking (reg-pay). */
export const PAID_STATUSES = new Set(["paid", "confirmed", "complete", "succeeded"]);

const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "2026-09-21" → "Mon, Sep 21". The key carries no zone, so format it in none. */
export function dayLabel(date: string): string {
  return DAY_LABEL.format(new Date(`${date}T12:00:00Z`));
}

/** Every email this camper's household has bought under, lower-cased. */
export function householdEmails(family: RawFamily | undefined, linkEmail: string | null): Set<string> {
  const set = new Set<string>();
  if (family?.email) set.add(lower(family.email));
  if (family?.ccEmail) set.add(lower(family.ccEmail));
  if (linkEmail) set.add(lower(linkEmail));
  set.delete("");
  return set;
}

export function assemblePunchCards(
  input: PunchCardInput,
  opts: { now?: Date } = {}
): PunchCardBoard {
  const now = opts.now ?? new Date();
  const today = todayKey(now);

  const camperById = new Map(input.campers.map((c) => [c.id, c]));
  const familyById = new Map(input.families.map((f) => [f.id, f]));

  const dayCamps = input.catalog.filter((a) => a.offeringKind === "day_camp" && a.startsOn);
  const activityById = new Map(input.catalog.map((a) => [a.id, a]));
  const dates = [...new Set(dayCamps.map((a) => a.startsOn as string))].sort();

  const packs = input.catalog
    .filter((a) => isDayCampPack(a.id))
    .map((a) => ({
      activityId: a.id,
      name: a.name,
      credits: DAY_CAMP_PACKS[a.id].credits,
      cents: a.priceCents ?? DAY_CAMP_PACKS[a.id].cents,
      bookable: a.bookable,
    }))
    .sort((a, b) => a.credits - b.credits);

  const cards: PunchCard[] = input.students.map((student) => {
    const camper = student.camperId ? camperById.get(student.camperId) : undefined;
    const age = ageOn(camper?.birthdate ?? student.dateOfBirth, today);

    if (!camper) {
      return {
        student,
        camper: null,
        credits: { day: 0, snow: 0 },
        packsBought: [],
        days: [],
        ledger: [],
        age,
      };
    }

    const family = familyById.get(camper.familyId);
    const emails = householdEmails(family, input.linkEmail);
    const camperKey = lower(camper.name);

    /*
     * This child's live bookings: a paid order under one of the household's
     * addresses, a line item in this camper's exact name, for a day camp or a
     * pack. The name match is the registration system's own rule
     * (apply_credit_events and reg-pay both key campers by lower(name) inside
     * the family), applied INSIDE the household the camper_id already chose —
     * it never reaches across families.
     */
    const mine = input.orderItems.filter(
      (it) =>
        PAID_STATUSES.has(lower(it.orderStatus)) &&
        emails.has(lower(it.orderEmail)) &&
        lower(it.camperName) === camperKey &&
        it.activityId != null
    );

    const packsBought = mine
      .filter((it) => isDayCampPack(it.activityId as number))
      .map((it) => ({
        name: activityById.get(it.activityId as number)?.name ?? DAY_CAMP_PACKS[it.activityId as number].name,
        on: it.createdAt,
        credits: DAY_CAMP_PACKS[it.activityId as number].credits,
      }))
      .sort((a, b) => a.on.localeCompare(b.on));

    const bookedByDate = new Map<string, PunchCardBooking>();
    for (const it of mine) {
      const activity = activityById.get(it.activityId as number);
      if (!activity || activity.offeringKind !== "day_camp" || !activity.startsOn) continue;
      // Two bookings on one date cannot both be honored; the earlier one is the
      // one the office would keep. The card shows it and says nothing of the other.
      const existing = bookedByDate.get(activity.startsOn);
      if (existing && existing.on <= it.createdAt) continue;
      bookedByDate.set(activity.startsOn, {
        activityId: activity.id,
        name: activity.name,
        band: parseAgeBand(activity.ageRange),
        on: it.createdAt,
        viaCredit: it.unitPriceCents === 0,
        orderNo: it.orderId,
        orderItemId: it.id,
      });
    }

    // Booked days the catalog no longer lists (a listing switched off after
    // the sale) still belong on the card, so the date list is the union.
    const allDates = [...new Set([...dates, ...bookedByDate.keys()])].sort();

    let ageNote: string | undefined;
    const days: PunchCardDay[] = allDates.map((date) => {
      const ageThatDay = ageOn(camper.birthdate ?? student.dateOfBirth, date);
      const choice = bandChoiceForAge(ageThatDay);
      if (choice.note && !ageNote) ageNote = choice.note;
      const sessions: PunchCardSession[] = dayCamps
        .filter((a) => a.startsOn === date)
        .map((a) => {
          const band = parseAgeBand(a.ageRange);
          return {
            activityId: a.id,
            name: a.name,
            band,
            remaining: a.remaining,
            bookable: a.bookable,
            isDefaultBand: band?.key === choice.defaultKey,
            isOffered: band ? choice.offered.includes(band.key) : true,
            description: a.description ?? undefined,
          };
        })
        .sort((a, b) => (a.band?.lo ?? 99) - (b.band?.lo ?? 99));
      const booked = bookedByDate.get(date);
      const past = date < today;
      const full =
        !booked &&
        sessions.every((s) => !s.bookable || (s.remaining != null && s.remaining <= 0));
      return { date, label: dayLabel(date), sessions, booked, past, full };
    });

    /*
     * The ledger, for this child only: every grant or redemption in the
     * household's credit_events that names this camper. A line is described by
     * what the ledger says it was — the pack, the repair note — or, for a
     * redemption keyed `free_<hold>`, by the day it bought.
     */
    const ledger: PunchCardLedgerLine[] = [];
    const bookingByOrder = new Map<string, PunchCardBooking>();
    for (const b of bookedByDate.values()) bookingByOrder.set(b.orderNo, b);
    for (const ev of input.creditEvents) {
      if (!emails.has(lower(ev.email)) || !ev.detail) continue;
      const source = ev.detail.source;
      const grants = (ev.detail.grants ?? []).filter((g) => lower(g.camper) === camperKey);
      const redemptions = (ev.detail.redemptions ?? []).filter((r) => lower(r.camper) === camperKey);
      for (const g of grants) {
        ledger.push({
          on: ev.createdAt,
          kind: "grant",
          day: g.day ?? 0,
          snow: g.snow ?? 0,
          what: source === "credit_repair" ? "Office correction" : ev.paymentIntent.startsWith("portal_") ? "Office adjustment" : "Day Camp Pack",
        });
      }
      for (const r of redemptions) {
        const viaFree = ev.paymentIntent.startsWith("free_");
        const booked = mine.find(
          (it) =>
            viaFree && it.unitPriceCents === 0 && !isDayCampPack(it.activityId as number) && it.createdAt.slice(0, 10) === ev.createdAt.slice(0, 10)
        );
        const activity = booked ? activityById.get(booked.activityId as number) : undefined;
        ledger.push({
          on: ev.createdAt,
          kind: "redemption",
          day: r.day ?? 0,
          snow: r.snow ?? 0,
          what: source === "credit_repair" ? "Office correction" : activity?.name ?? "A day camp",
        });
      }
    }
    ledger.sort((a, b) => a.on.localeCompare(b.on));

    return {
      student,
      camper: {
        id: camper.id,
        name: camper.name,
        email: family?.email ?? input.linkEmail ?? "",
        parentName: family?.parentName ?? null,
      },
      credits: { day: camper.dayCredits, snow: camper.snowCredits },
      packsBought,
      days,
      ledger,
      ageNote,
      age,
    };
  });

  return {
    status: "ok",
    cards,
    snowBonusOpen: snowBonusOpen(now),
    packs,
    dayPriceCents: dayPriceFrom(input.catalog),
  };
}

/** $79 as the catalog states it; the config constant only when the catalog is silent. */
function dayPriceFrom(catalog: RawActivity[]): number {
  const priced = catalog.find((a) => a.offeringKind === "day_camp" && a.priceCents);
  return priced?.priceCents ?? DAY_CAMP_PRICE_CENTS;
}

/** The board that means "could not read the registration system". */
export const UNAVAILABLE_BOARD: PunchCardBoard = {
  status: "unavailable",
  cards: [],
  snowBonusOpen: false,
  packs: [],
  dayPriceCents: DAY_CAMP_PRICE_CENTS,
};

/* ── the source switch ─────────────────────────────────────────────────── */

/**
 * Wrapped in React cache(): the page, the dashboard tile and the nav badge
 * may each ask in one render, and the family's card must be read once and
 * answered identically to all of them.
 */
export const fetchPunchCards = cache(fetchPunchCardsUncached);

async function fetchPunchCardsUncached(familyId: string): Promise<PunchCardBoard> {
  if (!familyId) return UNAVAILABLE_BOARD;
  const mode = process.env.NEXT_PUBLIC_DATA_MODE ?? "mock";
  if (mode === "supabase") {
    const { readPunchCardInput } = await import("./punch-card-live");
    const input = await readPunchCardInput(familyId);
    return input ? assemblePunchCards(input) : UNAVAILABLE_BOARD;
  }
  const { mockPunchCardInput } = await import("./punch-card-mock");
  const input = mockPunchCardInput(familyId);
  return input ? assemblePunchCards(input) : UNAVAILABLE_BOARD;
}
