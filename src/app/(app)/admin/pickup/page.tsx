import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatCents, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DecisionForm } from "./decision-form";

export const metadata = { title: "Drop-off & pick-up" };

/** Staff approval queue + today's roster (#10). */
export default async function PickupAdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const provider = getProvider();
  const requests = await provider.getPickupRequestsForStaff(user.id);

  // Student names for display — staff can read all students.
  const { students } = await import("@/lib/api/mock/seed-data");
  const nameById = new Map(
    students.map((s) => [s.id, `${s.preferredName ?? s.firstName} ${s.lastName}`])
  );

  const pending = requests.filter((r) => r.status === "pending");
  const today = new Date().toISOString().slice(0, 10);
  const todayRoster = requests.filter(
    (r) => r.status === "approved" && r.startDate <= today && r.endDate >= today
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Drop-off & pick-up</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Who&apos;s here early or late today</CardTitle>
          <CardDescription>{formatDate(new Date().toISOString())}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {todayRoster.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No extended care scheduled today.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {todayRoster.map((request) => (
                <li key={request.id} className="flex justify-between gap-2 border-b py-1.5 last:border-b-0">
                  <span className="font-medium">{nameById.get(request.studentId)}</span>
                  <span className="text-muted-foreground">
                    {request.dropOffTime && `in ${request.dropOffTime}`}
                    {request.dropOffTime && request.pickUpTime && " · "}
                    {request.pickUpTime && `out ${request.pickUpTime}`}
                    {request.authorizedPickupPerson && ` · ${request.authorizedPickupPerson}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="pending-heading">
        <div className="mb-2 flex items-center gap-2">
          <h2 id="pending-heading" className="text-lg font-semibold">
            Awaiting approval
          </h2>
          {pending.length > 0 && <Badge>{pending.length}</Badge>}
        </div>

        {pending.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No requests waiting. 🎉
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((request) => (
              <Card key={request.id}>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div>
                    <p className="font-medium">{nameById.get(request.studentId)}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(`${request.startDate}T12:00:00Z`)}
                      {request.endDate !== request.startDate &&
                        ` – ${formatDate(`${request.endDate}T12:00:00Z`)}`}
                      {" · "}
                      {request.kind.replace("_", " ")}
                      {" · "}
                      {formatCents(request.feeCents)}
                    </p>
                    <p className="mt-1 text-sm">{request.reason}</p>
                    {request.authorizedPickupPerson && (
                      <p className="text-sm text-muted-foreground">
                        Pickup by: {request.authorizedPickupPerson}
                      </p>
                    )}
                  </div>
                  <DecisionForm requestId={request.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
