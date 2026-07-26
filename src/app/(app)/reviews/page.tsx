import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { getProvider } from "@/lib/api";
import { SCORE_PROMPTS } from "@/lib/api/reviews/types";
import { getSessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Feedback" };

const WINDOW_LABEL = {
  mid_session: "Mid-session check-in",
  end_of_session: "End of session",
  post_show: "After the show",
} as const;

/** Family-facing reviews (#15). */
export default async function ReviewsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/dashboard");

  const provider = getProvider();
  const [windows, mine] = await Promise.all([
    provider.getOpenReviewWindows(user.id),
    provider.getMyReviews(user.id),
  ]);

  const pending = windows.filter((entry) => !entry.alreadySubmitted);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <p className="text-muted-foreground">
          Private to NOVA PA staff and administrators. Other families never
          see it, and it&apos;s never public.
        </p>
      </div>

      {pending.length === 0 && mine.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <MessageSquare aria-hidden className="size-8 text-muted-foreground" />
            <p className="font-medium">No feedback requests right now</p>
            <p className="text-sm text-muted-foreground">
              We&apos;ll ask for your thoughts partway through each session and
              after every show.
            </p>
          </CardContent>
        </Card>
      )}

      {pending.map(({ window, subjectName }) => (
        <Card key={window.id}>
          <CardHeader>
            <CardTitle className="text-base">{subjectName}</CardTitle>
            <CardDescription>
              {WINDOW_LABEL[window.kind]} · open until {formatDate(window.closesAt)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReviewForm windowId={window.id} subjectName={subjectName} />
          </CardContent>
        </Card>
      ))}

      {mine.length > 0 && (
        <section aria-labelledby="mine-heading">
          <h2 id="mine-heading" className="mb-2 text-lg font-semibold">
            Feedback you&apos;ve sent
          </h2>
          <div className="flex flex-col gap-2">
            {mine.map((review) => (
              <Card key={review.id}>
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      {formatDate(review.createdAt)}
                    </p>
                    {review.isAnonymous && <Badge variant="secondary">Anonymous</Badge>}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {SCORE_PROMPTS.map((prompt) => (
                      <div key={prompt.key} className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">{prompt.label}</dt>
                        <dd className="tabular-nums">{review.scores[prompt.key]}/5</dd>
                      </div>
                    ))}
                  </dl>
                  {review.comment && <p className="text-sm">{review.comment}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
