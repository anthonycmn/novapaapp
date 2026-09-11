import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getCoaches } from "@/lib/api/coaching/coaches";
import {
  getCoachScheduleLines,
  getCoachingSummary,
} from "@/lib/api/coaching/booking";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { CoachCard } from "@/components/coaching/coach-card";
import { CoachChooser } from "@/components/coaching/coach-chooser";
import { YourCoaching } from "@/components/coaching/your-coaching";

export const metadata = { title: "Coaching" };

/**
 * Where a family starts coaching — in the order Tony stated it, 11 Sep 2026:
 * choose the child, then choose the coach WITH THEIR SCHEDULE LISTED. The
 * lesson kind, the quantity, the checkout and the scheduling prompt follow on
 * the chosen coach's own page, in that order.
 *
 * The coach-less package shop that used to sit here is gone: a package is
 * bought on the way to a coach, not in the abstract. Both halves must still
 * say yes for a coach to appear — offered in the portal, bio published — and
 * that is enforced in `getCoaches`, so this page renders whatever it is given.
 */
export default async function CoachesPage({
  searchParams,
}: {
  searchParams: Promise<{ bought?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { bought, error } = await searchParams;
  const provider = getProvider();
  const profiles = await provider.getStaffProfiles();
  const [coaches, summary, students] = await Promise.all([
    getCoaches(profiles),
    user.familyId ? getCoachingSummary(user.familyId) : Promise.resolve(null),
    user.familyId
      ? provider.getStudentsForFamily(user.id, user.familyId)
      : Promise.resolve([]),
  ]);
  const scheduleLines = await getCoachScheduleLines(
    coaches.map((coach) => coach.staffId)
  );

  const takingStudents = coaches.filter((coach) => coach.acceptingNew).length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Coaching</h1>
        <p className="text-muted-foreground">
          One-to-one lessons with the people who already teach here. Pick your
          performer, pick a coach, pick the kind of lesson — then pay and
          choose the weekly time you will keep.
        </p>
      </div>

      {/*
        Stripe sends the family back to the coach's page after paying; this
        banner only appears if something routed them here instead. The balance
        is credited by the WEBHOOK, which can land a second after the
        redirect, so this confirms the payment without promising the sessions
        are already showing.
      */}
      {bought && (
        <p className="rounded-lg border bg-card p-4 text-sm">
          <span className="font-medium">Thank you — your payment went through.</span>{" "}
          Your lessons are on their way and will appear within a moment. Your
          reference is {bought}.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/50 bg-card p-4 text-sm">
          {error}
        </p>
      )}

      {summary && <YourCoaching summary={summary} />}

      {coaches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <GraduationCap className="size-8 text-muted-foreground" />
            <p className="font-medium">No coaches are listed just yet</p>
            <p className="max-w-prose text-sm text-muted-foreground">
              Private coaching runs year-round. Message the office and we will
              match your performer with a coach.
            </p>
          </CardContent>
        </Card>
      ) : user.familyId && students.length > 0 ? (
        <CoachChooser
          students={students.map((student) => ({
            id: student.id,
            name: student.preferredName || student.firstName,
          }))}
          coaches={coaches.map((coach) => ({
            slug: coach.slug,
            staffId: coach.staffId,
            name: coach.name,
            headline: coach.headline ?? null,
            photoUrl: coach.profile.photoUrl ?? null,
            acceptingNew: coach.acceptingNew,
            disciplines: coach.disciplines,
            scheduleLines: scheduleLines[coach.staffId] ?? [],
          }))}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {takingStudents === coaches.length
              ? `${coaches.length} ${coaches.length === 1 ? "coach is" : "coaches are"} taking new students.`
              : `${takingStudents} of ${coaches.length} taking new students.`}
          </p>
          <div className="flex flex-col gap-2">
            {coaches.map((coach) => (
              <CoachCard key={coach.staffId} coach={coach} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
