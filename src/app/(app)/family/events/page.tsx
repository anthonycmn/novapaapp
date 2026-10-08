import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, MapPin, MicVocal } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getPerformance } from "@/lib/performance";
import { formatEastern } from "@/lib/performance/rules";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { ActStatusChip } from "@/components/performance/status-chip";
import { Countdown } from "@/components/performance/countdown";

export const metadata = { title: "Perform" };

/**
 * Performance Events a family can sign up for (hub 0097). Only events one of
 * the family's students is eligible for, or that the family is already part
 * of. CJ builds them in the staff portal; nothing here exists until he
 * publishes one.
 */
export default async function PerformEventsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/dashboard");
  const cards = await getPerformance().listEventsForFamily(user);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Perform</h1>
      {cards.length === 0 ? (
        <EmptyState
          icon={<MicVocal aria-hidden className="size-8" />}
          title="No performance sign-ups right now"
          description="When NOVAPA opens a showcase or cabaret your student can perform in, it appears here."
        />
      ) : (
        cards.map(({ event, open, myActs }) => (
          <Link key={event.id} href={`/family/events/${event.id}`} className="block">
            <Card className="transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {event.title}
                  {open ? <Badge variant="gold">Sign-ups open</Badge> : <Badge variant="secondary">Sign-ups closed</Badge>}
                </CardTitle>
                {event.subtitle && <CardDescription>{event.subtitle}</CardDescription>}
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {event.startsAt && (
                    <span className="flex items-center gap-1">
                      <CalendarDays aria-hidden className="size-3.5" /> {formatEastern(event.startsAt, "long")}
                    </span>
                  )}
                  {event.venueName && (
                    <span className="flex items-center gap-1">
                      <MapPin aria-hidden className="size-3.5" /> {event.venueName}
                    </span>
                  )}
                </div>
                {open && event.signupClosesAt && (
                  <div className="text-muted-foreground">
                    <Countdown until={event.signupClosesAt} />
                  </div>
                )}
                {myActs.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {myActs.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{a.title ?? "Untitled act"}</span>
                        <ActStatusChip status={a.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
