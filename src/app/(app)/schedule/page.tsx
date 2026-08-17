import { redirect } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { requestOrigin } from "@/lib/request-origin";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarViews } from "./calendar-views";
import { SubscribeCard } from "./subscribe-card";

export const metadata = { title: "Schedule" };

/**
 * Household calendar (#5): every commitment across all children, merged,
 * with per-child colors, conflict detection, and a subscribable iCal feed.
 */
export default async function SchedulePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const provider = getProvider();

  // Staff see the master schedule; families see their merged household view.
  if (!user.familyId) {
    if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");
    const events = await provider.getAllEvents(user.id);
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Master schedule</h1>
        {events.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Nothing scheduled yet.
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((event) => (
              <li key={event.id}>
                <Card>
                  <CardContent className="p-4">
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatEventTime(event.startsAt)} · {event.location}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const [events, students, token, origin] = await Promise.all([
    provider.getFamilyCalendar(user.id, user.familyId),
    provider.getStudentsForFamily(user.id, user.familyId),
    provider.getCalendarToken(user.id, user.familyId),
    requestOrigin(),
  ]);

  const conflictCount = events.filter((e) => e.conflictsWith?.length).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <CalendarPlus aria-hidden className="size-5 text-muted-foreground" />
      </div>

      {conflictCount > 0 && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 text-sm">
            <span className="font-medium text-destructive">
              {conflictCount} scheduling conflict{conflictCount === 1 ? "" : "s"}
            </span>{" "}
            between your children — check the flagged events below.
          </CardContent>
        </Card>
      )}

      <CalendarViews
        events={events}
        students={students.map((student) => ({
          id: student.id,
          name: student.preferredName ?? student.firstName,
        }))}
      />

      <SubscribeCard feedUrl={`${origin}/api/calendar/${token}`} />
    </div>
  );
}
