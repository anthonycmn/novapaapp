import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getEncore } from "@/lib/encore";
import { TIER_LABEL, formatPoints } from "@/lib/encore/rules";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * Encore Points on Home (hub 0098). The next reward is always named, because
 * "1,600 more for a show ticket" is what brings a family back; within 2,000
 * points it becomes the "almost there" nudge CJ built the $800 line for.
 * Renders nothing until the program is open for this family.
 */
export async function EncorePointsCard() {
  const user = await getSessionUser();
  if (!user?.familyId) return null;
  const summary = await getEncore().summary(user).catch(() => null);
  if (!summary) return null;
  const { balance, tier, next, affordable } = summary;
  const almost = Boolean(next && next.short <= 2000 && affordable.length === 0);

  const line = affordable.length
    ? `You can redeem ${affordable.length === 1 ? `a ${affordable[0].title.toLowerCase()}` : `${affordable.length} rewards`} now.`
    : next
      ? almost
        ? `You're ${formatPoints(next.short)} points from your next reward. Any class, camp day or store purchase unlocks it.`
        : `Next: ${next.reward.title}, ${formatPoints(next.short)} points away.`
      : "Everything on the menu is in reach.";

  return (
    <Card pad={false} data-tour="encore-points-tile">
      <SectionHeader title="Encore Points" inCard />
      <Link href="/family/rewards" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
        <Sparkles aria-hidden size={18} className="shrink-0 text-gold" />
        <span className="min-w-0 flex-1">
          <span className="block text-xl font-semibold tabular-nums">
            {formatPoints(balance)} <span className="text-[13px] font-normal text-muted-foreground">points · {TIER_LABEL[tier]}</span>
          </span>
          <span className={`block text-[13px] ${almost || affordable.length ? "text-foreground" : "text-muted-foreground"}`}>{line}</span>
        </span>
        <ArrowRight aria-hidden size={14} className="text-muted-foreground" />
      </Link>
    </Card>
  );
}
