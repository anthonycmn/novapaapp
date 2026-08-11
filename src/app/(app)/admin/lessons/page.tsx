import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { LESSON_DISCIPLINES, WEEKDAY_NAMES } from "@/lib/api/lessons/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatCents } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Lesson roster" };

/** "16:30" → "4:30 PM". */
function formatSlotTime(startTime: string): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  const h12 = ((hours + 11) % 12) + 1;
  return `${h12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

/**
 * The teaching week at a glance: every weekly slot, who's in it, what the
 * family wants to work on. Staff only — this is the one place slot holders'
 * names appear.
 */
export default async function LessonRosterPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const rows = await getProvider().getLessonRoster(user.id);
  const teachers = [...new Set(rows.map((row) => row.teacherName))];
  const booked = rows.filter((row) => row.studentName).length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Lesson roster</h1>
        <p className="text-muted-foreground">
          {booked} of {rows.length} weekly slots booked. Families book and
          cancel from the app; each booking repeats weekly.
        </p>
      </div>

      {teachers.map((teacherName) => {
        const teacherRows = rows.filter((row) => row.teacherName === teacherName);
        const meta = LESSON_DISCIPLINES.find(
          (d) => d.value === teacherRows[0].slot.discipline
        );
        return (
          <Card key={teacherName}>
            <CardContent className="flex flex-col gap-1 p-4">
              <p className="font-semibold">
                <span aria-hidden className="mr-1.5">
                  {meta?.emoji}
                </span>
                {teacherName}{" "}
                <span className="font-normal text-muted-foreground">
                  — {meta?.label},{" "}
                  {formatCents(teacherRows[0].slot.pricePerLessonCents)}/lesson
                </span>
              </p>
              {teacherRows.map(({ slot, studentName, familyName, goals }) => (
                <div
                  key={slot.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 text-sm last:border-b-0"
                >
                  <span className="min-w-36 font-medium">
                    {WEEKDAY_NAMES[slot.weekday]}s {formatSlotTime(slot.startTime)}
                  </span>
                  {studentName ? (
                    <>
                      <span>{studentName}</span>
                      <span className="text-muted-foreground">{familyName}</span>
                      {goals && (
                        <span className="w-full text-xs text-muted-foreground">
                          Working on: {goals}
                        </span>
                      )}
                    </>
                  ) : (
                    <Badge variant="outline">Open</Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground">
        Need to free a slot? Ask the family to cancel from Private lessons, or
        message the office — admin cancellation tools land with the payments
        build.
      </p>
    </div>
  );
}
