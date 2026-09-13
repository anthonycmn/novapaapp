import Link from "next/link";
import { redirect } from "next/navigation";
import { CloudSnow, Ticket, Users } from "lucide-react";
import { DAY_CAMP_CREDITS_GOOD_THROUGH, DAY_CAMP_HOURS } from "@/config/day-camps";
import { fetchPunchCards } from "@/lib/api/registration/punch-card";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { PunchCards } from "./punch-cards";

export const metadata = { title: "Day camp punch card" };

/**
 * The Day Camp Punch Card.
 *
 * CJ, 13 Sep 2026: "I want a DAY CAMP PUNCHCARD line in the navigation with
 * all of the dates listed, and then they can assign their credits based on
 * what they bought to the days — when this is done, the day camps curriculum
 * page includes them on the roster. Also allow them to buy more credits or
 * individual days… If they purchased a specific day — show that and do not
 * let them change, but allow them to add more to give them the deal and check
 * out. Click click click — no friction and easy to use."
 *
 * One card per child. Everything on it is read live from the registration
 * system (see lib/api/registration/punch-card.ts): the balance, the booked
 * days, the 21 dates and their spots. The only thing this page ever writes is
 * a $0 booking, and it writes that by driving the website's own checkout.
 */
export default async function DayCampsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/dashboard");

  const board = await fetchPunchCards(user.familyId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Day camp punch card</h1>
        <p className="text-muted-foreground">
          Every day camp on the calendar, {DAY_CAMP_HOURS}. Spend the credits from a
          Day Camp Pack with a tap, add days to a cart, or buy another pack. Days you
          have already bought are marked booked.
        </p>
      </div>

      {board.status === "unavailable" ? (
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="font-medium">We can&apos;t reach the registration system right now.</p>
            <p className="mt-1 text-muted-foreground">
              Your credits and bookings are safe over there — this page just can&apos;t
              read them at the moment. Try again in a minute, or{" "}
              <Link href="/messages" className="underline">message the office</Link>.
            </p>
          </CardContent>
        </Card>
      ) : board.cards.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden className="size-8" />}
          title="No children on this family yet"
          description="Once a child is on your family profile and in the registration system, their punch card appears here."
        />
      ) : (
        <PunchCards board={board} />
      )}

      <Card>
        <CardContent className="grid gap-3 p-4 text-[12.5px] text-muted-foreground sm:grid-cols-2">
          <p className="flex items-start gap-2">
            <Ticket aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
            <span>
              Credits come from a Day Camp Pack, belong to one camper, and are good
              through {DAY_CAMP_CREDITS_GOOD_THROUGH}. Five days in one checkout also
              get the pack price, whether or not you hold credits.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <CloudSnow aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
            <span>
              Snow Day credits are used automatically when we run a Snow Day Fun Day.
              We email by 7 AM; reply or call to claim the spot. There is nothing to
              book ahead.
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
