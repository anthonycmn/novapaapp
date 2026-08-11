import Link from "next/link";
import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { WEEKDAY_NAMES } from "@/lib/api/lessons/types";
import { getSessionUser } from "@/lib/auth/session";
import { cancelLessonBookingAction } from "@/lib/actions/lessons";
import { formatEventTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LessonBooker } from "./lesson-booker";

export const metadata = { title: "Private lessons" };

/**
 * Weekly recurring private lessons — same teacher, same time every week
 * (org policy). Booked lessons land on the family calendar with 24h
 * reminders; cancelling frees the slot for another family.
 */
export default async function LessonsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = getProvider();
  const [rows, myBookings] = await Promise.all([
    provider.getLessonSlots(user.id),
    provider.getMyLessonBookings(user.id),
  ]);
  const students = user.familyId
    ? (await provider.getStudentsForFamily(user.id, user.familyId)).map((s) => ({
        id: s.id,
        name: `${s.preferredName ?? s.firstName} ${s.lastName}`,
      }))
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Private lessons</h1>
        <p className="text-muted-foreground">
          A standing weekly time with the same NOVA PA teaching artist. Book
          once — it repeats every week until you cancel.
        </p>
      </div>

      {myBookings.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Your weekly lessons</h2>
          {myBookings.map(({ booking, slot, teacherName, studentName, nextLessonAt }) => (
            <Card key={booking.id} className="border-primary/40">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">
                    {studentName.split(" ")[0]} — {WEEKDAY_NAMES[slot.weekday]}s with{" "}
                    {teacherName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Next lesson: {formatEventTime(nextLessonAt)} · {slot.location}
                  </p>
                  {booking.goals && (
                    <p className="text-sm text-muted-foreground">
                      Working on: {booking.goals}
                    </p>
                  )}
                </div>
                <form action={cancelLessonBookingAction.bind(null, booking.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Cancel weekly slot
                  </Button>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <LessonBooker rows={rows} students={students} />

      <p className="text-center text-xs text-muted-foreground">
        Lessons are billed by the studio for now — online card payment is
        coming. Cancelling frees the time for another family.
      </p>

      <Link
        href="/store"
        className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Spirit buttons &amp; star pages →
      </Link>
    </div>
  );
}
