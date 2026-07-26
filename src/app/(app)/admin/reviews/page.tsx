import { redirect } from "next/navigation";
import { Flag, MessageSquare } from "lucide-react";
import { getProvider } from "@/lib/api";
import { aggregateByStaff, trend } from "@/lib/api/reviews/aggregate";
import { averageScore, SCORE_PROMPTS } from "@/lib/api/reviews/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendChart } from "@/components/reviews/trend-chart";
import { ReviewActions } from "./review-actions";

export const metadata = { title: "All feedback" };

/**
 * Admin review dashboard (#15). Admins see everything — including who wrote
 * an anonymous review — so they can follow up when something needs
 * attention. That's the one place identity is shown.
 */
export default async function AdminReviewsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "admin")) redirect("/dashboard");

  const provider = getProvider();
  const [reviews, staff] = await Promise.all([
    provider.getAllReviews(user.id),
    provider.getStaffProfiles(),
  ]);
  const staffById = new Map(staff.map((member) => [member.id, member]));
  const byStaff = aggregateByStaff(reviews);

  const flagged = reviews.filter((review) => review.flaggedAt && !review.resolvedAt);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">All feedback</h1>
        <p className="text-muted-foreground">
          {reviews.length} review{reviews.length === 1 ? "" : "s"}. Reviewer
          names are visible here even for anonymous submissions — treat them
          accordingly.
        </p>
      </div>

      {flagged.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flag aria-hidden className="size-4 text-destructive" />
              {flagged.length} flagged for follow-up
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      {reviews.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <MessageSquare aria-hidden className="size-8 text-muted-foreground" />
            <p className="font-medium">No feedback yet</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Overall trend</CardTitle>
              <CardDescription>Average score across everything</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <TrendChart points={trend(reviews)} label="Overall score over time" />
            </CardContent>
          </Card>

          {byStaff.size > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">By staff member</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 pt-0">
                {[...byStaff.entries()].map(([staffId, summary]) => (
                  <div
                    key={staffId}
                    className="flex items-center justify-between gap-2 border-b pb-2 text-sm last:border-b-0 last:pb-0"
                  >
                    <span className="font-medium">
                      {staffById.get(staffId)?.fullName ?? staffId}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {summary.overall.toFixed(1)} / 5 · {summary.count} review
                      {summary.count === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <section aria-labelledby="all-heading">
            <h2 id="all-heading" className="mb-2 text-lg font-semibold">
              Every review
            </h2>
            <div className="flex flex-col gap-2">
              {reviews.map((review) => (
                <Card
                  key={review.id}
                  className={review.flaggedAt && !review.resolvedAt ? "border-destructive/50" : undefined}
                >
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {review.reviewerName}
                          {review.isAnonymous && (
                            <Badge variant="secondary" className="ml-2">
                              submitted anonymously
                            </Badge>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(review.createdAt)} ·{" "}
                          {review.staffIds
                            .map((id) => staffById.get(id)?.fullName ?? id)
                            .join(", ") || "no staff attached"}
                        </p>
                      </div>
                      <Badge variant={averageScore(review.scores) >= 4 ? "default" : "gold"}>
                        {averageScore(review.scores).toFixed(1)} / 5
                      </Badge>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 text-sm sm:grid-cols-4">
                      {SCORE_PROMPTS.map((prompt) => (
                        <div key={prompt.key}>
                          <dt className="text-xs text-muted-foreground">{prompt.label}</dt>
                          <dd className="tabular-nums">{review.scores[prompt.key]}/5</dd>
                        </div>
                      ))}
                    </dl>

                    {review.comment && <p className="text-sm">{review.comment}</p>}

                    {review.flaggedAt && (
                      <p className="text-sm text-destructive">
                        Flagged: {review.flagReason}
                      </p>
                    )}
                    {review.resolvedAt && (
                      <p className="text-sm text-muted-foreground">
                        Resolved {formatDate(review.resolvedAt)} · {review.resolutionNote}
                      </p>
                    )}

                    <ReviewActions
                      reviewId={review.id}
                      isFlagged={Boolean(review.flaggedAt)}
                      isResolved={Boolean(review.resolvedAt)}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
