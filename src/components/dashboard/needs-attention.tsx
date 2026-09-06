import Link from "next/link";
import { AlertCircle, ArrowRight, CircleDot } from "lucide-react";
import { loadProfileReview } from "@/lib/profile-review";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * The one list a parent actually needs from a dashboard.
 *
 * The completeness rules have lived in lib/profile-completeness since #9 —
 * but they rendered only on /family, so a parent who never opened their
 * profile page was never told their child's health form was unsigned (24 of
 * 308 enrolled children had one on the day of the Sep 5 2026 audit). This
 * panel puts the same alerts on the page everyone lands on, required first,
 * each one a link to the exact place that clears it.
 *
 * Renders nothing when nothing is owed — a permanent "you're all set" card
 * is furniture, and the nav badge already carries the standing mark.
 */
const SUGGESTED_SHOWN = 3;

export async function NeedsAttentionPanel({
  userId,
  familyId,
}: {
  userId: string;
  familyId: string;
}) {
  try {
    const loaded = await loadProfileReview(userId, familyId);
    if (!loaded) return null;
    const { review } = loaded;
    if (review.alerts.length === 0) return null;

    const suggested = review.suggested.slice(0, SUGGESTED_SHOWN);
    const hiddenSuggested = review.suggested.length - suggested.length;

    return (
      <Card pad={false}>
        <SectionHeader title="Needs your attention" inCard />
        <ul className="flex flex-col divide-y">
          {[...review.required, ...suggested].map((alert, index) => (
            <li key={`${alert.href}-${alert.label}-${index}`}>
              <Link
                href={alert.href}
                className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted"
              >
                {alert.severity === "required" ? (
                  <AlertCircle aria-hidden size={15} className="mt-0.5 shrink-0 text-destructive" />
                ) : (
                  <CircleDot aria-hidden size={15} className="mt-0.5 shrink-0 text-gold" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">
                    {alert.label}
                    {alert.studentName ? ` — ${alert.studentName}` : ""}
                  </span>
                  <span className="block text-[12px] text-muted-foreground">{alert.why}</span>
                </span>
                <ArrowRight aria-hidden size={14} className="mt-1 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
        {hiddenSuggested > 0 && (
          <p className="border-t px-4 py-2 text-[12px] text-muted-foreground">
            <Link href="/family" className="underline underline-offset-4 hover:text-foreground">
              {hiddenSuggested} more suggestion{hiddenSuggested === 1 ? "" : "s"} on your family
              profile
            </Link>
          </p>
        )}
      </Card>
    );
  } catch {
    return null; // a broken to-do list must never break the dashboard
  }
}
