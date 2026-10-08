import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Clock, MapPin, Ticket } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { requestOrigin } from "@/lib/request-origin";
import { getPerformance } from "@/lib/performance";
import {
  actEditable,
  formatClock,
  formatEastern,
  formatMinutes,
  formatPlainDate,
  formatRuntime,
  gradeLabel,
  performerName,
} from "@/lib/performance/rules";
import {
  ACT_FORMAT_LABELS,
  ACT_TYPE_LABELS,
  type PerformanceAct,
  type PerformanceEvent,
  type Requirement,
} from "@/lib/performance/types";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RichText } from "@/components/performance/rich-text";
import { ActStatusChip } from "@/components/performance/status-chip";
import { Countdown } from "@/components/performance/countdown";
import {
  InviteAnswer,
  PayFeeButton,
  StartActForm,
  WithdrawButton,
} from "@/components/performance/event-controls";

export const metadata = { title: "Perform" };

const REQ_LABELS: Array<[keyof PerformanceEvent, string]> = [
  ["reqVideo", "Performance video link"],
  ["reqHeadshot", "Headshot"],
  ["reqTrack", "Backing track"],
  ["reqSheetMusic", "Sheet music"],
  ["reqBio", "Program bio"],
];

const dollars = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function PerformanceEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/dashboard");

  const page = await getPerformance().getEventPage(user, eventId);
  if (!page) notFound();
  const { event, open, myActs, invitedActs, invites, candidates } = page;

  const accepted = [...myActs, ...invitedActs].some((a) => a.status === "accepted");
  const [token, origin] = accepted
    ? await Promise.all([getProvider().getCalendarToken(user.id, user.familyId), requestOrigin()])
    : [null, ""];
  const feedUrl = token ? `${origin}/api/calendar/${token}` : undefined;

  const asks = REQ_LABELS.filter(([key]) => event[key] !== "off").map(([key, label]) => ({
    label,
    required: event[key] === ("required" as Requirement),
  }));
  const where = [event.venueName, event.venueAddress].filter(Boolean).join(", ");
  const live = myActs.filter((a) => a.status !== "withdrawn");
  const past = myActs.filter((a) => a.status === "withdrawn");

  return (
    <div className="flex flex-col gap-4">
      <Link href="/family/events" className="text-sm text-muted-foreground hover:underline">
        Back to Perform
      </Link>

      <Card className="overflow-hidden" pad={false}>
        {event.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.posterUrl} alt={`${event.title} poster`} className="max-h-[28rem] w-full bg-muted object-contain" />
        )}
        <div className="flex flex-col gap-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{event.title}</h1>
            {open ? <Badge variant="gold">Sign-ups open</Badge> : <Badge variant="secondary">Sign-ups closed</Badge>}
          </div>
          {event.subtitle && <p className="text-muted-foreground">{event.subtitle}</p>}
          <div className="flex flex-col gap-1.5 text-sm">
            {event.startsAt && (
              <span className="flex items-center gap-2">
                <CalendarDays aria-hidden className="size-4 shrink-0" />
                {formatEastern(event.startsAt, "long")}
                {event.endsAt && ` to ${formatEastern(event.endsAt, "time")}`}
              </span>
            )}
            {event.callAt && (
              <span className="flex items-center gap-2">
                <Clock aria-hidden className="size-4 shrink-0" /> Performers arrive by {formatEastern(event.callAt, "time")}
              </span>
            )}
            {where && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(where)}`}
                className="flex items-center gap-2 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                <MapPin aria-hidden className="size-4 shrink-0" /> {where}
              </a>
            )}
            {event.signupClosesAt && (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Ticket aria-hidden className="size-4 shrink-0" />
                <Countdown until={event.signupClosesAt} />
              </span>
            )}
          </div>
          <RichText body={event.description} />
        </div>
      </Card>

      {invites.length > 0 && (
        <Card id="invites" className="border-gold">
          <CardHeader>
            <CardTitle>You have {invites.length === 1 ? "an invitation" : `${invites.length} invitations`}</CardTitle>
            <CardDescription>Another family wants your student in their act. It only counts once you confirm.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {invites.map((invite) => (
              <div key={invite.performerId} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
                <p className="text-sm">
                  <span className="font-medium">{invite.invitedByFamilyName}</span> invited your student to perform
                  {invite.actTitle ? <> in <span className="font-medium">&ldquo;{invite.actTitle}&rdquo;</span></> : null}
                  {invite.actFormat ? ` (${ACT_FORMAT_LABELS[invite.actFormat]}${invite.actType ? `, ${ACT_TYPE_LABELS[invite.actType]}` : ""})` : ""}.
                </p>
                <InviteAnswer performerId={invite.performerId} eventId={event.id} candidates={candidates} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {live.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Your acts</h2>
          {live.map((act) => (
            <ActSummaryCard key={act.id} act={act} event={event} mine feedUrl={feedUrl} />
          ))}
        </section>
      )}

      {invitedActs.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Acts your student is in</h2>
          {invitedActs.map((act) => (
            <ActSummaryCard key={act.id} act={act} event={event} mine={false} feedUrl={feedUrl} />
          ))}
        </section>
      )}

      {open && (
        <Card>
          <CardHeader>
            <CardTitle>{live.length ? "Sign up another act" : "Sign up to perform"}</CardTitle>
            <CardDescription>Your progress saves after every step, so you can stop and come back before sign-ups close.</CardDescription>
          </CardHeader>
          <CardContent>
            {candidates.some((c) => c.eligible) ? (
              <StartActForm eventId={event.id} candidates={candidates} />
            ) : (
              <p className="text-sm text-muted-foreground">None of your students is eligible for this event.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>What to know</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <Info label="Act types">{event.actTypes.map((t) => ACT_TYPE_LABELS[t]).join(", ")}</Info>
            <Info label="Formats">{event.actFormats.map((f) => ACT_FORMAT_LABELS[f]).join(", ")}</Info>
            {event.maxMinutesPerAct && <Info label="Longest act">{formatMinutes(event.maxMinutesPerAct)} minutes</Info>}
            {event.maxActsPerStudent && (
              <Info label="Acts per student">
                Up to {event.maxActsPerStudent}
              </Info>
            )}
            {event.maxPerformersPerAct && <Info label="Performers per act">Up to {event.maxPerformersPerAct}</Info>}
            {(event.minAge !== undefined || event.maxAge !== undefined) && (
              <Info label="Ages">
                {event.minAge ?? "any"} to {event.maxAge ?? "any"}
              </Info>
            )}
            {(event.minGrade !== undefined || event.maxGrade !== undefined) && (
              <Info label="Grades">
                {event.minGrade !== undefined ? gradeLabel(event.minGrade) : "any"} to {event.maxGrade !== undefined ? gradeLabel(event.maxGrade) : "any"}
              </Info>
            )}
            <Info label="How acts are chosen">
              {event.selectionMode === "everyone" ? "Everyone who signs up performs" : "CJ reviews every act"}
            </Info>
            {event.feeCents > 0 && <Info label="Participation fee">{dollars(event.feeCents)} per act</Info>}
            {event.allowGuests && <Info label="Guest performers">Welcome, from outside NOVAPA</Info>}
          </dl>
          {asks.length > 0 && (
            <div>
              <div className="font-medium">We will ask for</div>
              <ul className="mt-1 list-disc pl-5">
                {asks.map((a) => (
                  <li key={a.label}>
                    {a.label} <span className="text-muted-foreground">({a.required ? "required" : "optional"})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {event.rehearsals.length > 0 && (
            <div>
              <div className="font-medium">Rehearsals</div>
              <ul className="mt-1 flex flex-col gap-1">
                {event.rehearsals.map((r) => (
                  <li key={r.id}>
                    {formatPlainDate(r.onDate)}
                    {r.startsAt && `, ${formatClock(r.startsAt)}${r.endsAt ? ` to ${formatClock(r.endsAt)}` : ""} ET`}
                    {r.place && ` · ${r.place}`} ·{" "}
                    <span className={r.required ? "font-medium" : "text-muted-foreground"}>{r.required ? "required" : "optional"}</span>
                    {r.notes && <span className="text-muted-foreground"> · {r.notes}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {past.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Withdrawn: {past.map((a) => a.title ?? "Untitled act").join(", ")}
        </p>
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ActSummaryCard({
  act,
  event,
  mine,
  feedUrl,
}: {
  act: PerformanceAct;
  event: PerformanceEvent;
  mine: boolean;
  feedUrl?: string;
}) {
  const editable = mine && actEditable(event, act);
  const href = `/family/events/${event.id}/act/${act.id}`;
  const pending = act.performers.filter((p) => p.inviteStatus === "pending").length;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {act.title ?? "Untitled act"}
          <ActStatusChip status={act.status} />
          {act.slot && <Badge variant="outline">Number {act.slot} in the running order</Badge>}
        </CardTitle>
        <CardDescription>
          {[
            act.actType && ACT_TYPE_LABELS[act.actType],
            act.actFormat && ACT_FORMAT_LABELS[act.actFormat],
            act.runtimeSeconds && formatRuntime(act.runtimeSeconds),
          ]
            .filter(Boolean)
            .join(" · ")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {act.status === "needs_changes" && act.familyNote && mine && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <div className="font-medium">CJ asked for a change</div>
            <p className="whitespace-pre-line">{act.familyNote}</p>
          </div>
        )}
        <ul className="flex flex-col gap-1">
          {act.performers
            .filter((p) => p.inviteStatus !== "declined")
            .map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span>{performerName(p)}</span>
                {p.kind === "guest" && <Badge variant="outline">Guest</Badge>}
                {p.inviteStatus === "pending" ? (
                  <Badge variant="secondary">Waiting to confirm{mine && p.inviteEmail ? ` (${p.inviteEmail})` : ""}</Badge>
                ) : (
                  <Badge variant="outline">Confirmed</Badge>
                )}
              </li>
            ))}
        </ul>
        {pending > 0 && mine && (
          <p className="text-muted-foreground">
            An invited performer counts once their family confirms in their own Parent Portal. You can submit before they do.
          </p>
        )}
        {act.status === "accepted" && (
          <div className="flex flex-col gap-1 rounded-md bg-muted/60 p-3">
            <div className="font-medium">You are in the show</div>
            {event.callAt && <div>Call time: {formatEastern(event.callAt, "long")}</div>}
            {!act.slot && <div className="text-muted-foreground">The running order is published closer to the date.</div>}
            {event.rehearsals.filter((r) => r.required).map((r) => (
              <div key={r.id}>
                Rehearsal: {formatPlainDate(r.onDate)}
                {r.startsAt && `, ${formatClock(r.startsAt)} ET`}
                {r.place && ` · ${r.place}`}
              </div>
            ))}
            {feedUrl && (
              <a className="text-primary underline-offset-4 hover:underline" href={feedUrl.replace(/^https?:/, "webcal:")}>
                Add to your calendar
              </a>
            )}
          </div>
        )}
        {mine && act.feeCents > 0 && !act.feePaid && act.status !== "draft" && act.status !== "withdrawn" && act.status !== "declined" && (
          <PayFeeButton actId={act.id} label={`Pay the ${dollars(act.feeCents)} participation fee`} />
        )}
        {mine && act.feeCents > 0 && act.feePaid && <p className="text-muted-foreground">Participation fee paid.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className={buttonVariants({ size: "sm", variant: act.status === "draft" || act.status === "needs_changes" ? "default" : "outline" })}
            href={editable && act.status === "draft" ? `${href}?step=resume` : href}
          >
            {act.status === "draft" ? "Continue sign-up" : act.status === "needs_changes" ? "Make the change" : editable ? "View or edit" : "View"}
          </Link>
          {/* Withdrawing is always open: a family that can no longer come should say so. */}
          {mine && act.status !== "withdrawn" && act.status !== "declined" && (
            <WithdrawButton actId={act.id} eventId={event.id} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
