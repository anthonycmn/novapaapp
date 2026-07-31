import Link from "next/link";
import { redirect } from "next/navigation";
import { PartyPopper } from "lucide-react";
import { getProvider } from "@/lib/api";
import { DISCIPLINES, RUBRIC_CRITERIA } from "@/lib/api/auditions/types";
import { getSessionUser } from "@/lib/auth/session";
import { requestFeedbackAction } from "@/lib/actions/auditions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { ConfirmForm } from "./confirm-form";

export const metadata = { title: "Casting" };

/**
 * The family's casting page: their own children's roles ONLY — this page
 * never renders another student's name or a cast list. Confirmation,
 * feedback release, and growth recommendations all live here.
 */
export default async function CastingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/dashboard");

  const provider = getProvider();
  const confirmations = await provider.getMyCastingConfirmations(user.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Casting</h1>

      {confirmations.length === 0 ? (
        <EmptyState
          icon={<PartyPopper aria-hidden className="size-8" />}
          title="No casting news yet"
          description="When casting is announced, your child's role appears here — you'll get a notification the moment it does."
        />
      ) : (
        await Promise.all(
          confirmations.map(async ({ confirmation, roleName, productionTitle, studentName }) => {
            const feedbackReleased = Boolean(confirmation.feedbackRequestedAt);
            const feedback = feedbackReleased
              ? await provider.requestAuditionFeedback(user.id, confirmation.id)
              : [];
            const assignment = feedbackReleased
              ? await provider.getCastingForStudent(user.id, confirmation.studentId)
              : [];
            const productionId = assignment[0]?.productionId;
            const recommendations =
              feedbackReleased && productionId
                ? await provider.getGrowthRecommendations(
                    user.id,
                    confirmation.studentId,
                    productionId
                  )
                : [];

            return (
              <Card key={confirmation.id} className="border-gold/50">
                <CardHeader>
                  <CardTitle as="h2" className="text-lg">
                    🎉 {studentName.split(" ")[0]} will be…{" "}
                    <span className="text-primary">{roleName}</span>
                  </CardTitle>
                  <CardDescription>
                    {productionTitle}. Congratulations — every role makes the show.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <ConfirmForm
                    confirmationId={confirmation.id}
                    studentName={studentName}
                    responded={confirmation.nameCorrect !== undefined}
                    currentPlaybillName={confirmation.playbillName}
                  />

                  <div className="border-t pt-4">
                    {!feedbackReleased ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm text-muted-foreground">
                          Want to know how the audition went? Request the
                          creative team&apos;s feedback — the same rubric the
                          director, vocal director, and choreographer used.
                        </p>
                        <form action={requestFeedbackAction.bind(null, confirmation.id)}>
                          <Button type="submit" variant="outline">
                            Request audition feedback
                          </Button>
                        </form>
                      </div>
                    ) : feedback.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Feedback requested ✓ — nothing has been submitted by
                        the team yet. Whatever they submit will appear here
                        automatically, no need to ask again.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-4">
                        <h3 className="font-semibold">Audition feedback</h3>
                        {feedback.length < DISCIPLINES.length && (
                          <p className="rounded-lg bg-muted p-2 text-sm text-muted-foreground">
                            {feedback.length} of {DISCIPLINES.length} areas
                            submitted so far — the rest appear as soon as the
                            team completes them.
                          </p>
                        )}
                        {feedback.map((evaluation) => {
                          const meta = DISCIPLINES.find(
                            (d) => d.value === evaluation.discipline
                          )!;
                          return (
                            <div key={evaluation.id} className="rounded-lg border p-3">
                              <p className="mb-2 text-sm font-semibold">
                                {meta.label}{" "}
                                <span className="font-normal text-muted-foreground">
                                  — {meta.evaluatorTitle}
                                </span>
                              </p>
                              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                {RUBRIC_CRITERIA[evaluation.discipline].map((criterion) => (
                                  <div
                                    key={criterion.key}
                                    className="flex justify-between gap-2"
                                  >
                                    <dt className="text-muted-foreground">
                                      {criterion.label}
                                    </dt>
                                    <dd className="tabular-nums">
                                      {evaluation.scores[criterion.key]}/5
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                              {evaluation.notes && (
                                <p className="mt-2 border-t pt-2 text-sm">
                                  {evaluation.notes}
                                </p>
                              )}
                            </div>
                          );
                        })}

                        {recommendations.length > 0 && (
                          <div className="rounded-lg bg-accent p-4">
                            <h4 className="font-semibold text-accent-foreground">
                              Keep growing between shows
                            </h4>
                            {recommendations.map((recommendation) => (
                              <div key={recommendation.discipline} className="mt-2 text-sm">
                                <p className="text-accent-foreground">
                                  {recommendation.message}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  <Link
                                    href="/store/catalog"
                                    className="inline-flex h-10 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
                                  >
                                    Book{" "}
                                    {recommendation.discipline === "vocal"
                                      ? "voice"
                                      : recommendation.discipline}{" "}
                                    lessons
                                  </Link>
                                  {recommendation.classIds.length > 0 && (
                                    <Badge variant="secondary" className="self-center">
                                      Weekly classes available at registration
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )
      )}
    </div>
  );
}
