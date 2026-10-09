import type {
  LedgerEntry,
  ProgramState,
  Redemption,
  RedeemDetail,
  RedeemResult,
  Reward,
  StudentChoice,
} from "./types";

/**
 * The storage half of Encore Points: rows in, rows out (hub 0098).
 *
 * Who may do what is settled in service.ts. Redeeming, earning and spending a
 * store voucher are the database's own row-locked functions in live mode
 * (ep_redeem, ep_sync, ep_use_voucher); the mock imitates them so the whole
 * thing can be walked in the mock-mode preview.
 */
export interface EncoreRepo {
  readonly mode: "mock" | "live";
  program(familyId: string): Promise<ProgramState>;
  rewards(): Promise<Reward[]>;
  ledger(familyId: string): Promise<LedgerEntry[]>;
  redemptions(familyId: string): Promise<Redemption[]>;
  students(familyId: string): Promise<StudentChoice[]>;
  redeem(familyId: string, rewardKey: string, studentId: string | null, detail: RedeemDetail): Promise<RedeemResult>;
  /** Mark a store voucher spent on an order. False if it was already used. */
  useVoucher(familyId: string, itemId: string, orderReference: string): Promise<boolean>;
  /** Earn everything paid and not yet in the ledger (the hourly job). */
  sync(): Promise<Record<string, unknown>>;
}
