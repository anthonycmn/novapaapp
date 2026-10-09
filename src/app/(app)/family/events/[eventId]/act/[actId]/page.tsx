import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getPerformance } from "@/lib/performance";
import {
  formatClock,
  formatEastern,
  formatPlainDate,
  formatRuntime,
  parseVideoLink,
  performerName,
  signupOpen,
  stepsFor,
  WIZARD_STEPS,
  type WizardStep,
} from "@/lib/performance/rules";
import { ACT_FORMAT_LABELS, ACT_TYPE_LABELS } from "@/lib/performance/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActWizard } from "@/components/performance/act-wizard";
import { InviteePerformerForm } from "@/components/performance/invitee-form";
import { ActStatusChip } from "@/components/performance/status-chip";

export const metadata = { title: "Sign up to perform" };

/**
 * One act (hub 0097). The family that submitted it gets the step-by-step
 * sign-up while it can still change; afterwards, and for a family whose
 * student was invited onto it, a read-only summary.
 */
export default async function ActPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; actId: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const [{ eventId, actId }, { step }] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/dashboard");

  const service = getPerformance();
  const page = await service.getActPage(user, actId);
  if (!page || page.event.id !== eventId) notFound();
  const { event, act, mine, editable, candidates, problem, termsMd5 } = page;

  if (mine && editable) {
    const steps = stepsFor(event);
    const resume = steps[Math.min(act.step, steps.length - 1)] ?? steps[0];
    const requested =
      WIZARD_STEPS.includes(step as WizardStep) && steps.includes(step as WizardStep) ? (step as WizardStep) : undefined;
    const initial: WizardStep = requested ?? (act.status === "draft" ? resume : "review");
    return (
      <ActWizard
        key={act.id}
        event={event}
        act={act}
        candidates={candidates}
        initialStep={initial}
        problem={problem}
        termsMd5={termsMd5}
        isMock={service.mode === "mock"}
      />
    );
  }

  const myPerformer = !mine
    ? act.performers.find((p) => p.familyId === user.familyId && p.inviteStatus === "confirmed")
    : undefined;
  const video = act.videoUrl ? parseVideoLink(act.videoUrl) : null;
  const canEditMine = Boolean(myPerformer) && signupOpen(event);

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/family/events/${event.id}`} className="text-sm text-muted-foreground hover:underline">
        Back to {event.title}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold sm:text-2xl">{act.title ?? "Untitled act"}</h1>
        <ActStatusChip status={act.status} />
      </div>
      {mine && !editable && act.status !== "withdrawn" && act.status !== "declined" && (
        <p className="text-sm text-muted-foreground">
          Sign-ups closed {formatEastern(event.signupClosesAt)}, so this act can be viewed but not changed. Need a change? Message the office.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {[act.actType && ACT_TYPE_LABELS[act.actType], act.actFormat && ACT_FORMAT_LABELS[act.actFormat], act.runtimeSeconds && formatRuntime(act.runtimeSeconds)]
              .filter(Boolean)
              .join(" · ")}
          </CardTitle>
          {act.source && (
            <CardDescription>
              {act.source}
              {act.characterName ? `, as ${act.characterName}` : ""}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {act.description && <p>{act.description}</p>}
          <div>
            <div className="text-muted-foreground">Performers</div>
            <ul>
              {act.performers
                .filter((p) => p.inviteStatus !== "declined")
                .map((p) => (
                  <li key={p.id}>
                    {performerName(p)}
                    {p.inviteStatus === "pending" ? " (waiting to confirm)" : ""}
                  </li>
                ))}
            </ul>
          </div>
          {mine && video?.ok && (
            <a href={video.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
              Performance video
            </a>
          )}
          {mine && act.trackFilename && <div>Track: {act.trackFilename}</div>}
          {event.rehearsals.length > 0 && act.status === "accepted" && (
            <div>
              <div className="text-muted-foreground">Rehearsals</div>
              <ul>
                {event.rehearsals.map((r) => (
                  <li key={r.id}>
                    {formatPlainDate(r.onDate)}
                    {r.startsAt && `, ${formatClock(r.startsAt)} ET`}
                    {r.place && ` · ${r.place}`} {r.required ? "(required)" : "(optional)"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {act.status === "accepted" && event.callAt && <div>Call time: {formatEastern(event.callAt, "long")}</div>}
          {act.slot && <div>Number {act.slot} in the running order</div>}
        </CardContent>
      </Card>

      {myPerformer && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your student&apos;s details</CardTitle>
            <CardDescription>
              {canEditMine ? "Add a headshot and program details for your student in this act." : "Sign-ups have closed."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canEditMine ? (
              <InviteePerformerForm
                event={event}
                act={act}
                performer={myPerformer}
                candidate={candidates.find((c) => c.studentId === myPerformer.studentId)}
              />
            ) : (
              <p className="text-sm">{myPerformer.programName}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
