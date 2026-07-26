import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, Ticket } from "lucide-react";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import type { CalendarEvent, Enrollment, Student } from "@/lib/api/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { EnrollmentsCard } from "@/components/dashboard/enrollments-card";
import { FeatureGrid } from "@/components/dashboard/feature-grid";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Home" };

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const provider = getProvider();

  const isStaff = hasRoleAtLeast(user, "staff");
  let students: Student[] = [];
  let enrollments: Enrollment[] = [];
  if (user.familyId) {
    [students, enrollments] = await Promise.all([
      provider.getStudentsForFamily(user.id, user.familyId),
      provider.getEnrollmentsForFamily(user.id, user.familyId),
    ]);
  }
  const [productions, classes] = await Promise.all([
    provider.getProductions(),
    provider.getClasses(),
  ]);
  const balanceCents = enrollments
    .filter((e) => e.status !== "withdrawn")
    .reduce((sum, e) => sum + e.balanceCents, 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome back, {user.displayName.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground">
          {isStaff ? "Staff dashboard" : user.family?.name ?? org.programBrand}
        </p>
      </div>

      {balanceCents > 0 && (
        <Card className="border-gold/50 bg-accent">
          <CardContent className="flex items-center justify-between p-4">
            <p className="text-sm font-medium text-accent-foreground">
              Outstanding balance: ${(balanceCents / 100).toFixed(2)}
            </p>
            <Badge variant="gold">Payment due</Badge>
          </CardContent>
        </Card>
      )}

      {students.length > 0 && (
        <section aria-labelledby="students-heading">
          <h2 id="students-heading" className="mb-2 text-lg font-semibold">
            Your students
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {students.map((student) => (
              <Link key={student.id} href={`/family/students/${student.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Avatar
                      name={`${student.firstName} ${student.lastName}`}
                      src={student.headshotUrl}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {student.preferredName ?? student.firstName} {student.lastName}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        Grade {student.grade}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {user.familyId && (
        <EnrollmentsCard
          enrollments={enrollments}
          students={students}
          productions={productions}
          classes={classes}
        />
      )}

      <UpcomingEvents />

      <FeatureGrid isStaff={isStaff} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quick links</CardTitle>
          <CardDescription>Tickets and the main site open in a new tab.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <a
            href={org.ticketsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Ticket aria-hidden className="size-4" />
            Buy tickets on BookTix
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
          <a
            href={org.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-accent"
          >
            {org.shortName} website
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

async function UpcomingEvents() {
  // Phase 0: shows the seeded events; Phase 3 replaces this with the full
  // per-family aggregated calendar.
  const { events } = await import("@/lib/api/mock/seed-data");
  const upcoming: CalendarEvent[] = [...events]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 3);

  if (upcoming.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No upcoming events — enjoy the quiet before the next show week.
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-labelledby="upcoming-heading">
      <h2 id="upcoming-heading" className="mb-2 text-lg font-semibold">
        Coming up
      </h2>
      <div className="flex flex-col gap-2">
        {upcoming.map((event) => (
          <Card key={event.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{event.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatEventTime(event.startsAt)} · {event.location}
                  </p>
                </div>
                {event.changeNote && (
                  <Badge variant="gold" className="shrink-0">
                    Updated
                  </Badge>
                )}
              </div>
              {event.changeNote && (
                <p className="mt-1 text-sm text-accent-foreground">{event.changeNote}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
