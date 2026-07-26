import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { SCORE_PROMPTS } from "@/lib/api/reviews/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendChart } from "@/components/reviews/trend-chart";

export const metadata = { title: "My feedback" };

/**
 * Staff-facing feedback (#15). Aggregate scores plus written comments about
 * this staff member's own work — with reviewer identity stripped. The data
 * layer returns a type that has no reviewer field at all, so nothing here
 * can leak it even by accident.
 */
export default async function StaffFeedbackPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");
  if (!user.staffId) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">My feedback</h1>
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Your account isn&apos;t linked to a staff profile yet.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { reviews, aggregate, trend } = await getProvider().getReviewsForStaff(
    user.id,
    user.staffId
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">My feedback</h1>
        <p className="text-muted-foreground">
          What families said about classes and shows you worked on.
        </p>
      </div>

      {aggregate.count === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No feedback yet. It arrives after each session&apos;s check-in
            window opens.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Overall {aggregate.overall.toFixed(1)} / 5
              </CardTitle>
              <CardDescription>
                From {aggregate.count} review{aggregate.count === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pt-0">
              {SCORE_PROMPTS.map((prompt) => {
                const value = aggregate.averages[prompt.key];
                return (
                  <div key={prompt.key} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0">{prompt.label}</span>
                    <span
                      className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={`${prompt.label}: ${value.toFixed(1)} out of 5`}
                    >
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${(value / 5) * 100}%` }}
                      />
                    </span>
                    <span className="w-10 shrink-0 text-right tabular-nums">
                      {value.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Trend</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <TrendChart points={trend} label="Your overall score over time" />
            </CardContent>
          </Card>

          <section aria-labelledby="comments-heading">
            <h2 id="comments-heading" className="mb-2 text-lg font-semibold">
              What families wrote
            </h2>
            <div className="flex flex-col gap-2">
              {reviews
                .filter((review) => review.comment)
                .map((review) => (
                  <Card key={review.id}>
                    <CardContent className="p-4">
                      <p className="text-sm">{review.comment}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {review.attribution} · {formatDate(review.createdAt)}
                      </p>
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
