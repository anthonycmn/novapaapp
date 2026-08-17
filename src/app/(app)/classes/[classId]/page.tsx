import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Users } from "lucide-react";
import { getProvider } from "@/lib/api";
import { classSchedule } from "@/lib/api/catalog/class-schedule";
import type { FamilyCalendarEvent } from "@/lib/api/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatEventTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatTile } from "@/components/ui/stat-tile";
import { ShowFeed } from "@/components/productions/show-feed";

export const metadata = { title: "Class" };

/**
 * One class, with the same live feed and private question thread the shows
 * have (Tony, 17 Aug 2026). A class is not a lesser thing than a musical: a
 * family whose child is in a Tuesday dance class needs "no class next week"
 * as much as a cast family needs a rehearsal note, and until now they had
 * nowhere to read it and nowhere to ask.
 */
export default async function ClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { classId } = await params;

  const provider = getProvider();
  const [classes, staff, events, enrollments] = await Promise.all([
    provider.getClasses(),
    provider.getStaffProfiles(),
    user.familyId
      ? provider.getFamilyCalendar(user.id, user.familyId)
      : Promise.resolve<FamilyCalendarEvent[]>([]),
    user.familyId
      ? provider.getEnrollmentsForFamily(user.id, user.familyId)
      : Promise.resolve([]),
  ]);

  const offering = classes.find((entry) => entry.id === classId);
  if (!offering) notFound();

  const teachers = staff.filter((member) => offering.staffIds.includes(member.id));
  const nowIso = new Date().toISOString();
  const mySessions = events
    .filter((event) => event.classId === offering.id)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const nextSession = mySessions.find((event) => event.endsAt >= nowIso);
  const enrolled = enrollments.filter(
    (enrollment) => enrollment.classId === offering.id && enrollment.status !== "withdrawn"
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/classes"
          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden size={14} /> All classes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{offering.name}</h1>
        <p className="text-muted-foreground">
          {classSchedule(offering)}
          {offering.location && ` · ${offering.location}`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Next session"
          value={nextSession ? formatEventTime(nextSession.startsAt).split("·")[0].trim() : "—"}
          hint={
            nextSession
              ? formatEventTime(nextSession.startsAt).split("·")[1]?.trim()
              : enrolled.length > 0
                ? "Nothing on the calendar yet"
                : "You're not enrolled in this one"
          }
          href="/schedule"
        />
        <StatTile
          label="When it meets"
          value={classSchedule(offering).split("·")[0].trim()}
          hint={classSchedule(offering).split("·")[1]?.trim() ?? "Time to be confirmed"}
        />
        <StatTile
          label={enrolled.length === 1 ? "Your child" : "Your children"}
          value={enrolled.length || "—"}
          hint={enrolled.length > 0 ? "Enrolled in this class" : "Not enrolled"}
          href="/family"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ShowFeed
            classId={offering.id}
            productionTitle={offering.name}
            userId={user.id}
            isStaff={hasRoleAtLeast(user, "staff")}
          />
        </div>

        <div className="flex flex-col gap-4">
          {teachers.length > 0 && (
            <Card pad={false}>
              <SectionHeader title="Who teaches it" inCard />
              <ul className="divide-y">
                {teachers.map((teacher) => (
                  <li key={teacher.id}>
                    <Link
                      href={`/staff/${teacher.id}`}
                      className="flex items-start gap-2 px-4 py-2.5 hover:bg-muted"
                    >
                      <Users aria-hidden size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                      <span>
                        <span className="block text-[13px] font-medium">
                          {teacher.fullName}
                        </span>
                        <span className="block text-[12px] text-muted-foreground">
                          {teacher.title}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card pad={false}>
            <SectionHeader title="Where" inCard />
            <p className="flex items-start gap-2 px-4 py-3 text-[13px]">
              <MapPin aria-hidden size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
              {offering.location || "Location to be confirmed"}
            </p>
          </Card>

          {/* Only this family's own sessions — the class calendar for somebody
              who is not enrolled would be a schedule they cannot attend. */}
          {mySessions.length > 0 && (
            <Card pad={false}>
              <SectionHeader
                title="Your sessions"
                inCard
                right={
                  <Link
                    href="/schedule"
                    className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    <CalendarDays aria-hidden size={13} /> Calendar
                  </Link>
                }
              />
              <ul className="max-h-72 divide-y overflow-y-auto">
                {mySessions.slice(0, 12).map((session) => (
                  <li
                    key={session.id}
                    className={session.endsAt < nowIso ? "px-4 py-2 opacity-55" : "px-4 py-2"}
                  >
                    <p className="text-[12.5px]">{formatEventTime(session.startsAt)}</p>
                    {session.changeNote && (
                      <p className="text-[12px] text-gold">{session.changeNote}</p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
