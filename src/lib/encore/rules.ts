import type { LedgerEntry, Reward, Tier } from "./types";

/**
 * The arithmetic of Encore Points, pure, so the page and the tests agree with
 * the database (hub 0098 ep_tier_at / ep_rate / ep_sync). The database is the
 * authority; these exist so a parent sees the same numbers before they press
 * Redeem.
 */

/** Nothing on the menu costs less. CJ: a family spends $800 before its first
 *  reward, and a $795 show registration lands 50 points short on purpose. */
export const FIRST_REWARD_POINTS = 8000;

export const DIRECTOR_CENTS = 150_000;
export const PRODUCER_CENTS = 300_000;

export const TIER_LABEL: Record<Tier, string> = {
  patron: "Patron",
  director: "Director",
  producer: "Producer",
};

export function rateFor(tier: Tier): number {
  return tier === "producer" ? 12.5 : tier === "director" ? 11 : 10;
}

export function tierFor(
  seasonSpendCents: number,
  lastSeasonSpendCents = 0,
  director = DIRECTOR_CENTS,
  producer = PRODUCER_CENTS
): Tier {
  const best = Math.max(seasonSpendCents, lastSeasonSpendCents);
  return best >= producer ? "producer" : best >= director ? "director" : "patron";
}

/** Points a payment earns at a tier. Matches floor(cents * rate / 100). */
export function pointsFor(cents: number, tier: Tier): number {
  return Math.floor((cents * rateFor(tier)) / 100);
}

/** Sep 1, New York, of the season a moment falls in. */
export function seasonStart(at: Date): Date {
  const ny = new Date(at.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const year = ny.getMonth() >= 8 ? ny.getFullYear() : ny.getFullYear() - 1;
  // Midnight Sep 1 in New York is 04:00 UTC (EDT).
  return new Date(Date.UTC(year, 8, 1, 4));
}

export function balanceOf(ledger: Pick<LedgerEntry, "points">[]): number {
  return ledger.reduce((sum, e) => sum + e.points, 0);
}

export function spendBetween(ledger: LedgerEntry[], from: Date, to: Date): number {
  return ledger
    .filter((e) => {
      const t = new Date(e.occurredAt).getTime();
      return t >= from.getTime() && t < to.getTime();
    })
    .reduce((sum, e) => sum + e.spendCents, 0);
}

/** The cheapest reward still out of reach, and how far away it is. */
export function nextReward(balance: number, rewards: Reward[]): { reward: Reward; short: number } | null {
  const ahead = rewards.filter((r) => r.points > balance).sort((a, b) => a.points - b.points);
  return ahead.length ? { reward: ahead[0], short: ahead[0].points - balance } : null;
}

/** Dollars still to spend to reach the next tier, or null at Producer. */
export function toNextTier(
  tier: Tier,
  seasonSpendCents: number,
  director = DIRECTOR_CENTS,
  producer = PRODUCER_CENTS
): { tier: Tier; cents: number } | null {
  if (tier === "producer") return null;
  const target = tier === "director" ? producer : director;
  return { tier: tier === "director" ? "producer" : "director", cents: Math.max(0, target - seasonSpendCents) };
}

export const formatPoints = (n: number) => n.toLocaleString("en-US");
export const formatDollars = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 ? 2 : 0 })}`;

export const TSHIRT_SIZES = ["YS", "YM", "YL", "AS", "AM", "AL", "AXL", "A2XL"] as const;

/** What the history line says for one ledger entry. */
export function describeEntry(e: LedgerEntry): string {
  if (e.note) return e.note;
  const ref = e.sourceRef ?? "";
  if (ref.startsWith("installment:")) return "Monthly or plan payment";
  if (ref.startsWith("order:")) return "Registration";
  if (ref.startsWith("store:")) return "Parent Portal store";
  if (ref.startsWith("tix:")) return "Show tickets";
  if (e.kind === "referral") return "Referred a new family";
  if (e.kind === "expire") return "Points expired";
  if (e.kind === "reversal") return "Refund or cancellation";
  if (e.kind === "adjust") return "Adjusted by the office";
  return "Points";
}
