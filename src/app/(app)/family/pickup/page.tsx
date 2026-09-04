import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { formatCents, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrivalCard } from "@/components/family/arrival-card";
import { PickupRequestForm } from "./request-form";
import { currentImpersonation } from "@/lib/auth/impersonation";
import { BlockedWhileImpersonating } from "@/components/blocked-while-impersonating";

export const metadata = { title: "Pickup & drop-off" };

const STATUS_VARIANT = {
  pending: "secondary",
  approved: "default",
  denied: "destructive",
} as const;

export default async function PickupPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/dashboard");

  const provider = getProvider();
  const [students, requests] = await Promise.all([
    provider.getStudentsForFamily(user.id, user.familyId),
    provider.getPickupRequestsForFamily(user.id, user.familyId),
  ]);
  const studentsById = new Map(students.map((s) => [s.id, s]));

  /**
   * Approved requests collapse into an event with one button; everything else
   * stays in the list below as a status.
   *
   * Tony, 17 Aug 2026: "the form kinda collapses as this is the event, and then
   * they click a button that says I'm here." Only approved ones get the button —
   * pressing "I'm here" for something nobody has agreed to would tell Health &
   * Safety to expect a child they have not been told about.
   *
   * Anything that has already ended drops out: a card offering to announce your
   * arrival at last Tuesday's pickup is noise on the day that matters.
   */
  const today = new Date().toISOString().slice(0, 10);
  const live = requests.filter(
    (request) => request.status === "approved" && request.endDate >= today
  );

  /* Hub 0063 — a Chief standing in for this family may read all of this
     and submit none of it. */
  const standingIn = Boolean(await currentImpersonation());

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Early pickup & late drop-off</h1>

      {live.length > 0 && (
        <section aria-labelledby="pickup-live" className="flex flex-col gap-2">
          <h2 id="pickup-live" className="text-lg font-semibold">
            {live.length === 1 ? "Your next one" : "Coming up"}
          </h2>
          {live.map((request) => {
            const student = studentsById.get(request.studentId);
            return (
              <ArrivalCard
                key={request.id}
                request={request}
                studentName={
                  student ? (student.preferredName ?? student.firstName) : "Your child"
                }
                parentName={user.displayName}
              />
            );
          })}
        </section>
      )}

      {requests.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your requests</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0">
            {requests.map((request) => {
              const student = studentsById.get(request.studentId);
              return (
                <div key={request.id} className="border-b py-2 text-sm last:border-b-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {student?.preferredName ?? student?.firstName} ·{" "}
                        {formatDate(`${request.startDate}T12:00:00Z`)}
                        {request.endDate !== request.startDate &&
                          ` – ${formatDate(`${request.endDate}T12:00:00Z`)}`}
                      </p>
                      <p className="text-muted-foreground">
                        {request.kind === "late_dropoff"
                          ? `Drop-off ${request.dropOffTime}`
                          : request.kind === "early_pickup"
                            ? `Pick-up ${request.pickUpTime}`
                            : `${request.dropOffTime} – ${request.pickUpTime}`}{" "}
                        · {formatCents(request.feeCents)}
                      </p>
                      {request.decisionNote && (
                        <p className="mt-1 text-muted-foreground">
                          Staff: {request.decisionNote}
                        </p>
                      )}
                    </div>
                    <Badge variant={STATUS_VARIANT[request.status]} className="shrink-0 capitalize">
                      {request.status}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New request</CardTitle>
          <CardDescription>
            Staff reviews each request so we can plan supervision. Approved
            requests appear on your family calendar automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {standingIn ? (
            <BlockedWhileImpersonating action="pickup" title="Arranging a collection" />
          ) : (
            <PickupRequestForm students={students} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
