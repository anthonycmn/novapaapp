import Link from "next/link";
import { redirect } from "next/navigation";
import { PartyPopper } from "lucide-react";
import { getProvider } from "@/lib/api";
import { DISCIPLINES, RUBRIC_CRITERIA } from "@/lib/api/auditions/types";
import { getSessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
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
          confirmations.map(async ({
            confirmation,
            roleName,
            productionTitle,
            studentName,
            performances,
          }) => {
            const feedbackReleased = Boolean(confirmation.feedbackRequestedAt);
            const feedback = feedbackReleased
              ? await provider.requestAuditionFeedback(user.id, confirmation.id)
              : [];
            const assignment = await provider.getCastingForStudent(
              user.id,
              confirmation.studentId
            );
            const productionId = assignment[0]?.productionId;
            const scenes = productionId
              ? await provider.getStudentSceneBreakdown(
                  user.id,
                  confirmation.studentId,
                  productionId
                )
              : [];
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

                  {/* A shared part, and the nights that are theirs.
                      Only drawn when the role is actually double cast — a part
                      played the whole run carries no rows at all (hub 0052),
                      so this stays silent rather than telling every family
                      seven dates they already have on the calendar. */}
                  {performances && performances.length > 0 && (
                    <div className="rounded-lg border border-gold/50 bg-gold/5 p-3">
                      <h3 className="text-sm font-semibold">
                        {studentName.split(" ")[0]} plays {roleName} at these performances
                      </h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        This role is shared, so the run is split. These are the ones to invite
                        people to.
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {performances.map((p) => (
                          <li
                            key={p.id}
                            title={p.title}
                            className="rounded-md border bg-background px-2 py-1 text-[13px] font-medium"
                          >
                            {formatDate(p.startsAt)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {scenes.length > 0 && (
                    <div className="border-t pt-4">
                      <h3 className="font-semibold">
                        Exactly what {studentName.split(" ")[0]} is in
                      </h3>
                      <p className="mb-2 text-sm text-muted-foreground">
                        From the production&apos;s script &amp; music breakdown —
                        rehearsals for these will appear on your calendar.
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {scenes.map(({ scene, roleName: as, isUnderstudy }) => (
                          <li
                            key={scene.id}
                            className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm"
                          >
                            <span>
                              <span aria-hidden className="mr-1.5">
                                {scene.kind === "song" ? "🎵" : "🎭"}
                              </span>
                              {scene.name}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              as {as}
                              {isUnderstudy ? " — rehearse & be ready" : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

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
                              {evaluation.growthNotes && (
                                <p className="mt-2 rounded-lg bg-accent p-2 text-sm text-accent-foreground">
                                  <span className="font-semibold">
                                    How to keep growing:{" "}
                                  </span>
                                  {evaluation.growthNotes}
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
                                    href="/store/lessons"
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
