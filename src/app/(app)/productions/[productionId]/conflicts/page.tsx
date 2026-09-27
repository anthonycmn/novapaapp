import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarOff } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { formatTime } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { CallResponse } from "@/components/dashboard/call-response";
import { ConflictsClosedBanner } from "@/components/conflicts-closed-banner";

export const metadata = { title: "Conflicts" };

/**
 * A show's conflict form: every call this family's children are on, in one
 * list, each with the Set Attendance chip.
 *
 * CJ, 27 Sep 2026: "fix the frozen pages so people can submit conflicts."
 * A Frozen parent wrote in that they could not find the conflict form. The
 * form was never missing, it was scattered: one small dashed chip under each
 * rehearsal on the dashboard, the calendar and the show's schedule rail. A
 * parent looking for "the conflict form" was looking for a page, and this is
 * the page. It saves through the same chip, so an answer given here and one
 * given on the dashboard are the same answer.
 */
export default async function ConflictsPage({
  params,
}: {
  params: Promise<{ productionId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect(`/productions/${(await params).productionId}`);
  const { productionId } = await params;

  const provider = getProvider();
  const production = await provider.getProduction(productionId);
  if (!production) notFound();

  const [students, familyEvents, responses] = await Promise.all([
    provider.getStudentsForFamily(user.id, user.familyId),
    provider.getFamilyCalendar(user.id, user.familyId),
    provider.getMyCallResponses(user.id),
  ]);

  const answers = new Map(
    responses.map((r) => [`${r.eventId}:${r.studentId}`, { status: r.status, reason: r.reason }])
  );
  const now = new Date().toISOString();
  const calls = familyEvents
    .filter((event) => event.productionId === production.id && event.endsAt >= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const closedFor = production.conflictsClosedAt ? production.title : undefined;
  const children = students
    .map((student) => ({
      id: student.id,
      name: student.preferredName ?? student.firstName,
      calls: calls.filter((event) => event.studentIds.includes(student.id)),
    }))
    .filter((child) => child.calls.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href={`/productions/${production.id}`}
          className="text-[13px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {production.title}
        </Link>
        <h1 className="text-2xl font-semibold">Conflicts</h1>
        {!closedFor && (
          <p className="text-muted-foreground">
            Every rehearsal and performance your child is called to. Tap their name on any call they
            will miss, or only make part of, and choose <strong>Not Attending</strong> or{" "}
            <strong>Partial</strong>. Add a note to say why, or when they will arrive or leave. The
            directors see it right away. You only need to mark the calls with a conflict.
          </p>
        )}
      </div>

      {closedFor && <ConflictsClosedBanner productionTitles={[closedFor]} />}

      {children.length === 0 ? (
        <EmptyState
          icon={<CalendarOff aria-hidden className="size-8" />}
          title="No upcoming calls"
          description="When your child has upcoming rehearsals for this show, they appear here."
        />
      ) : (
        children.map((child) => (
          <Card key={child.id}>
            <CardHeader className="pb-2">
              <CardTitle as="h2" className="text-base">
                {child.name}
              </CardTitle>
              <CardDescription>
                {child.calls.length} upcoming {child.calls.length === 1 ? "call" : "calls"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y rounded-lg border">
                {child.calls.map((event) => {
                  const day = formatInTimeZone(new Date(event.startsAt), org.timeZone, "EEE, MMM d");
                  const time = `${formatTime(event.startsAt)} - ${formatTime(event.endsAt)}`;
                  return (
                    <li
                      key={event.id}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium">
                          {day} <span className="font-normal text-muted-foreground">· {time}</span>
                        </p>
                        <p className="truncate text-[13px] text-muted-foreground">{event.title}</p>
                      </div>
                      <CallResponse
                        eventId={event.id}
                        studentId={child.id}
                        studentName={child.name}
                        answer={answers.get(`${event.id}:${child.id}`) ?? null}
                        eventTitle={event.title}
                        eventWhen={`${day} · ${formatTime(event.startsAt)}`}
                        conflictsClosedFor={closedFor}
                      />
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))
      )}

      <p className="text-sm text-muted-foreground">
        Missing a stretch of days?{" "}
        <Link href="/family/absences" className="text-primary underline underline-offset-2">
          Report an absence
        </Link>{" "}
        covers a range of dates at once.
      </p>
    </div>
  );
}
