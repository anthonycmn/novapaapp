/**
 * Encore Points, the family loyalty program (hub 0098). CJ, 9 Oct 2026.
 *
 * Families earn 10 points per $1 they pay NOVA PA (11 at Director, 12.5 at
 * Producer) and spend them here on rewards. The program is invisible to
 * families until CJ presses Launch in the staff portal.
 */

export type Tier = "patron" | "director" | "producer";

export type RewardKind =
  | "show_night_pack"
  | "spirit_button"
  | "show_ticket"
  | "tshirt"
  | "star_page"
  | "day_camp_day"
  | "registration_credit";

export interface Reward {
  key: string;
  kind: RewardKind;
  title: string;
  blurb: string;
  points: number;
  valueCents: number;
  /** quarter | half | full, for star pages. */
  size?: string;
  sort: number;
}

export type LedgerKind = "earn" | "referral" | "redeem" | "refund" | "adjust" | "expire" | "reversal";

export interface LedgerEntry {
  id: string;
  points: number;
  kind: LedgerKind;
  sourceRef?: string;
  spendCents: number;
  tier?: Tier;
  occurredAt: string;
  note?: string;
}

export type ItemKind =
  | "concession"
  | "gram"
  | "tshirt"
  | "ticket_code"
  | "registration_code"
  | "store_voucher"
  | "day_camp_credit";

export interface RedemptionItem {
  id: string;
  item: ItemKind;
  code?: string;
  status: "open" | "done" | "cancelled";
  studentId?: string;
  detail: Record<string, unknown>;
  doneAt?: string;
}

export interface Redemption {
  id: string;
  rewardKey: string;
  kind: RewardKind;
  title: string;
  points: number;
  studentId?: string;
  status: "active" | "cancelled";
  createdAt: string;
  items: RedemptionItem[];
}

export interface StudentChoice {
  id: string;
  name: string;
  tshirtSize?: string;
  /** Has a row on the website's day camp punch card. */
  onPunchCard: boolean;
}

export interface RedeemDetail {
  size?: string;
  message?: string;
  from?: string;
}

export interface RedeemResult {
  id: string;
  title: string;
  points: number;
  balance: number;
  codes: { item: ItemKind; code: string }[];
}

export interface ProgramState {
  launched: boolean;
  paused: boolean;
  /** This family may see the program (launched and not paused, or on the preview list). */
  openForFamily: boolean;
  directorCents: number;
  producerCents: number;
  referralPoints: number;
}
