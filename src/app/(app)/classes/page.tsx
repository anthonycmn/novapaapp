import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { OfferingTile } from "@/components/productions/offering-tile";
import { classSchedule } from "@/lib/api/catalog/class-schedule";

export const metadata = { title: "Classes" };

/**
 * Every class, with the family's own first.
 *
 * The other half of what used to be one "Productions" page. A class is not a
 * smaller show — a parent looks one up to check a day and a time, where they
 * look a show up to check a call — so it gets a list that leads with the day
 * and time rather than with an opening night.
 */
export default async function ClassesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const provider = getProvider();

  const [classes, enrollments] = await Promise.all([
    provider.getClasses(),
    user.familyId
      ? provider.getEnrollmentsForFamily(user.id, user.familyId)
      : Promise.resolve([]),
  ]);

  const mine = new Set(
    enrollments
      .filter((enrollment) => enrollment.status !== "withdrawn")
      .map((enrollment) => enrollment.classId)
      .filter(Boolean)
  );

  /*
   * ONLY the classes this family is registered for — same rule as Shows, and
   * for the same reason (Tony, 17 Aug 2026: "the same is true for classes").
   * A parent opening this page wants their Tuesday, not a prospectus; what is
   * open to sign up for lives on the dashboard, read from the real catalogue.
   *
   * Staff have no family and no enrolments, so for them it is the whole list.
   */
  const ours = classes
    .filter((offering) => (user.familyId ? mine.has(offering.id) : true))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));

  const tileFor = (offering: (typeof classes)[number]) => (
    <OfferingTile
      key={offering.id}
      href={`/classes/${offering.id}`}
      Icon={BookOpen}
      title={offering.name}
      subtitle={classSchedule(offering)}
      meta={offering.location || undefined}
      // No "you're in this" badge any more: every class on the page is one
      // they are in, so it marked nothing.
      badge={undefined}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Classes</h1>

      {ours.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <BookOpen aria-hidden className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {user.familyId
                ? "You're not in a class at the moment"
                : "No classes running at the moment"}
            </p>
            {user.familyId && (
              <p className="max-w-sm text-sm text-muted-foreground">
                Once your child is enrolled in one, it appears here with its day
                and time. What&apos;s open to sign up for is on your{" "}
                <Link
                  href="/dashboard"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  dashboard
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <section className="flex flex-col gap-2">{ours.map(tileFor)}</section>
      )}
    </div>
  );
}
