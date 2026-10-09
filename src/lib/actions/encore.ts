"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { getSessionUser } from "@/lib/auth/session";
import { refuseIfImpersonating } from "@/lib/auth/impersonation";
import { getEncore } from "@/lib/encore";
import type { RedeemDetail, RedeemResult } from "@/lib/encore/types";

/**
 * Encore Points, the family's one button: Redeem (hub 0098). Returns a
 * sentence instead of throwing, so a refusal ("You need 1,200 more points")
 * shows in the dialog rather than on an error page.
 */

export type RedeemActionResult = { ok: true; result: RedeemResult } | { ok: false; message: string };

export async function redeemRewardAction(
  rewardKey: string,
  studentId: string | null,
  detail: RedeemDetail
): Promise<RedeemActionResult> {
  try {
    const user = await getSessionUser();
    if (!user?.familyId) return { ok: false, message: "Sign in as a parent to use Encore Points." };
    // Spending a family's points is spending their money.
    if (await refuseIfImpersonating("store")) {
      return { ok: false, message: "You're viewing this family as staff, so redeeming is turned off." };
    }
    const result = await getEncore().redeem(user, rewardKey, studentId, detail);
    await logActivity({
      user,
      action: "encore.redeemed",
      summary: `Redeemed ${result.points.toLocaleString("en-US")} Encore Points for ${result.title}`,
      detail: { rewardKey, redemptionId: result.id },
    });
    revalidatePath("/family/rewards");
    revalidatePath("/dashboard");
    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
