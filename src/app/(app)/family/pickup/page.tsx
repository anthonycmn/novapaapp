import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { formatCents, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PickupRequestForm } from "./request-form";

export const metadata = { title: "Drop-off & pick-up" };

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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Early drop-off & late pick-up</h1>

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
                        {request.kind === "early_dropoff"
                          ? `Drop-off ${request.dropOffTime}`
                          : request.kind === "late_pickup"
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
          <PickupRequestForm students={students} />
        </CardContent>
      </Card>
    </div>
  );
}
