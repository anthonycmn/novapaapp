import { AccessDeniedError } from "@/lib/api/provider";
import type { SessionUser } from "@/lib/api/types";
import type { EncoreRepo } from "./repo";
import { nextReward, seasonStart, spendBetween, tierFor, toNextTier } from "./rules";
import type {
  LedgerEntry,
  ProgramState,
  Redemption,
  RedeemDetail,
  RedeemResult,
  Reward,
  StudentChoice,
  Tier,
} from "./types";

/**
 * Encore Points for one signed-in family (hub 0098).
 *
 * Every method takes the session user and acts for user.familyId only. While
 * the program is not open for this family (not launched, paused, and not on
 * CJ's preview list) a family sees nothing at all: no nav item, no Home card,
 * and the Rewards page sends them home.
 */

export interface EncoreSummary {
  program: ProgramState;
  balance: number;
  tier: Tier;
  seasonSpendCents: number;
  next: { reward: Reward; short: number } | null;
  toNextTier: { tier: Tier; cents: number } | null;
  /** Points that can be spent right now, cheapest first. */
  affordable: Reward[];
}

export interface EncorePage extends EncoreSummary {
  rewards: Reward[];
  ledger: LedgerEntry[];
  redemptions: Redemption[];
  students: StudentChoice[];
}

/** A store voucher matched to a cart line at checkout. */
export interface VoucherPlan {
  /** cart item id → voucher item id */
  lines: Record<string, string>;
}

export class EncoreService {
  constructor(private readonly repo: EncoreRepo) {}

  get mode() {
    return this.repo.mode;
  }

  private familyOf(user: SessionUser): string {
    if (!user.familyId) throw new AccessDeniedError("Encore Points belong to a family account.");
    return user.familyId;
  }

  /** Cheap check for the nav and Home: is the program visible to this family? */
  async isOpen(user: SessionUser): Promise<boolean> {
    if (!user.familyId) return false;
    try {
      return (await this.repo.program(user.familyId)).openForFamily;
    } catch {
      // Before hub 0098 is applied the tables do not exist: hidden, not broken.
      return false;
    }
  }

  async summary(user: SessionUser): Promise<EncoreSummary | null> {
    const familyId = this.familyOf(user);
    const program = await this.repo.program(familyId);
    if (!program.openForFamily) return null;
    const [ledger, rewards] = await Promise.all([this.repo.ledger(familyId), this.repo.rewards()]);
    return this.summarize(program, ledger, rewards);
  }

  private summarize(program: ProgramState, ledger: LedgerEntry[], rewards: Reward[]): EncoreSummary {
    const now = new Date();
    const s0 = seasonStart(now);
    const lastStart = new Date(s0);
    lastStart.setUTCFullYear(lastStart.getUTCFullYear() - 1);
    const seasonSpendCents = spendBetween(ledger, s0, new Date(now.getTime() + 1));
    const lastSpend = spendBetween(ledger, lastStart, s0);
    const tier = tierFor(seasonSpendCents, lastSpend, program.directorCents, program.producerCents);
    const balance = ledger.reduce((sum, e) => sum + e.points, 0);
    return {
      program,
      balance,
      tier,
      seasonSpendCents,
      next: nextReward(balance, rewards),
      toNextTier: toNextTier(tier, seasonSpendCents, program.directorCents, program.producerCents),
      affordable: rewards.filter((r) => r.points <= balance).sort((a, b) => a.points - b.points),
    };
  }

  async page(user: SessionUser): Promise<EncorePage | null> {
    const familyId = this.familyOf(user);
    const program = await this.repo.program(familyId);
    if (!program.openForFamily) return null;
    const [ledger, rewards, redemptions, students] = await Promise.all([
      this.repo.ledger(familyId),
      this.repo.rewards(),
      this.repo.redemptions(familyId),
      this.repo.students(familyId),
    ]);
    return { ...this.summarize(program, ledger, rewards), rewards, ledger, redemptions, students };
  }

  async redeem(user: SessionUser, rewardKey: string, studentId: string | null, detail: RedeemDetail): Promise<RedeemResult> {
    const familyId = this.familyOf(user);
    if (!(await this.repo.program(familyId)).openForFamily) {
      throw new AccessDeniedError("Encore Points is not open yet.");
    }
    return this.repo.redeem(familyId, rewardKey, studentId, {
      size: detail.size?.trim() || undefined,
      message: detail.message?.trim().slice(0, 280) || undefined,
      from: detail.from?.trim().slice(0, 80) || undefined,
    });
  }

  /**
   * Match the family's open store vouchers to cart lines: a spirit button
   * voucher covers one button line, a star page voucher covers one star page
   * line of the same size. Only quantity-1 lines, so a voucher pays for
   * exactly one item.
   */
  async planVouchers(
    user: SessionUser,
    cart: { id: string; productType: string; optionValue?: string; quantity: number }[]
  ): Promise<VoucherPlan> {
    const lines: Record<string, string> = {};
    if (!(await this.isOpen(user))) return { lines };
    const vouchers = (await this.repo.redemptions(this.familyOf(user)))
      .flatMap((r) => r.items)
      .filter((i) => i.item === "store_voucher" && i.status === "open");
    const used = new Set<string>();
    for (const line of cart) {
      if (line.quantity !== 1) continue;
      const v = vouchers.find((i) => {
        if (used.has(i.id)) return false;
        if (line.productType === "spirit_button") return i.detail.product === "spirit_button";
        if (line.productType === "star_page") {
          return i.detail.product === "star_page" && String(i.detail.size ?? "") === String(line.optionValue ?? "");
        }
        return false;
      });
      if (v) {
        used.add(v.id);
        lines[line.id] = v.id;
      }
    }
    return { lines };
  }

  async useVouchers(user: SessionUser, plan: VoucherPlan, orderReference: string): Promise<void> {
    const familyId = this.familyOf(user);
    for (const voucherId of Object.values(plan.lines)) {
      await this.repo.useVoucher(familyId, voucherId, orderReference);
    }
  }

  async sync(): Promise<Record<string, unknown>> {
    return this.repo.sync();
  }
}
