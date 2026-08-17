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

  const sorted = [...classes].sort((a, b) => {
    const minePriority = Number(mine.has(b.id)) - Number(mine.has(a.id));
    if (minePriority !== 0) return minePriority;
    return a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime);
  });

  const ours = sorted.filter((offering) => mine.has(offering.id));
  const rest = sorted.filter((offering) => !mine.has(offering.id));

  const tileFor = (offering: (typeof classes)[number]) => (
    <OfferingTile
      key={offering.id}
      href={`/classes/${offering.id}`}
      Icon={BookOpen}
      title={offering.name}
      subtitle={classSchedule(offering)}
      meta={offering.location || undefined}
      badge={mine.has(offering.id) ? "You're in this" : undefined}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Classes</h1>

      {classes.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No classes running at the moment.
          </CardContent>
        </Card>
      ) : (
        <>
          {ours.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {ours.length === 1 ? "Your class" : "Your classes"}
              </h2>
              {ours.map(tileFor)}
            </section>
          )}

          {rest.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {ours.length > 0 ? "Everything else running" : "Running now"}
              </h2>
              {rest.map(tileFor)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
