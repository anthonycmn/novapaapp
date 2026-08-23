import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getCoaches } from "@/lib/api/coaching/coaches";
import { getCoachingSummary } from "@/lib/api/coaching/booking";
import { getCoachingShop } from "@/lib/api/coaching/shop";
import { getPaymentProvider } from "@/lib/api/payments";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { CoachCard } from "@/components/coaching/coach-card";
import { YourCoaching } from "@/components/coaching/your-coaching";
import { BuySessions } from "@/components/coaching/buy-sessions";

export const metadata = { title: "Coaching" };

/**
 * The coaches a family can book — the page that has to exist before booking
 * can mean anything.
 *
 * Tony: "assign coaches, and then their bios are shown and people can book
 * coaching sessions with them."
 *
 * Assigning already existed in the staff portal and had never been used; what
 * was missing was this, the parent's side. A parent choosing a private coach
 * is making a bigger decision than picking a class time — they are handing a
 * child to one adult for an hour at a stretch — so the page leads with the
 * face and the paragraph rather than a price and a calendar.
 *
 * Both halves must say yes for somebody to appear here: offered as a coach in
 * the portal, and their bio published through the usual approval queue. That
 * is enforced in `getCoaches`, so this page renders whatever it is given.
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
  const [coaches, summary, offers, students] = await Promise.all([
    getCoaches(profiles),
    user.familyId ? getCoachingSummary(user.familyId) : Promise.resolve(null),
    getCoachingShop(),
    user.familyId
      ? provider.getStudentsForFamily(user.id, user.familyId)
      : Promise.resolve([]),
  ]);

  const takingStudents = coaches.filter((coach) => coach.acceptingNew).length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Coaching</h1>
        <p className="text-muted-foreground">
          One-to-one voice, acting, dance and audition coaching with the people
          who already teach here.
        </p>
      </div>

      {/*
        Stripe sends the family back here after paying, but the balance is
        credited by the WEBHOOK, which can land a second after the redirect.
        So this confirms the payment without promising the sessions are
        already showing — "on its way" is true either way, where "you now have
        three sessions" is briefly a lie.
      */}
      {bought && (
        <p className="rounded-lg border bg-card p-4 text-sm">
          <span className="font-medium">Thank you — your payment went through.</span>{" "}
          Your sessions are on their way and will appear below within a moment.
          Your reference is {bought}.
        </p>
      )}

      {summary && <YourCoaching summary={summary} />}

      {user.familyId && (
        <BuySessions
          offers={offers}
          students={students.map((student) => ({
            id: student.id,
            name: student.preferredName || student.firstName,
          }))}
          error={error}
          paymentsConfigured={getPaymentProvider().isConfigured()}
        />
      )}

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
