import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { events } from "@/lib/api/mock/seed-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Schedule" };

/**
 * Phase 0: simple agenda list of seeded events.
 * Phase 3 replaces this with the aggregated household calendar (#5) —
 * month/week/agenda views, per-child colors, conflict detection, iCal.
 */
export default async function SchedulePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const upcoming = [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Schedule</h1>
      {upcoming.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nothing scheduled yet.
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {upcoming.map((event) => (
            <li key={event.id}>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{event.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatEventTime(event.startsAt)} · {event.location}
                      </p>
                      {event.whatToBring && (
                        <p className="mt-1 text-sm">
                          <span className="font-medium">Bring:</span> {event.whatToBring}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="shrink-0 capitalize">
                      {event.type.replace("_", " ")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
