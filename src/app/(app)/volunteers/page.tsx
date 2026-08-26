import { redirect } from "next/navigation";
import { CalendarDays, HandHeart, MapPin } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { SlotForm } from "./slot-form";

export const metadata = { title: "Volunteer" };

/**
 * Volunteer sign-ups — the family's side of the sheets built in the staff
 * portal (hub 0048).
 *
 * ONLY THE SHOWS THIS FAMILY IS ON. A published sheet is readable by any
 * signed-in family, which is what lets a parent see whether a shift is already
 * covered, but a family whose child is in none of it does not want strike
 * night for a show they have never heard of.
 *
 * NAMES ARE SHOWN, first names of whoever is on each slot. That is the
 * question people open a sign-up sheet with — is this covered, and who am I
 * doing it with — and a sheet that hides it is a sheet nobody trusts. Phone
 * numbers and notes are not shown; those stay with the family that wrote them
 * and with staff.
 */
export default async function VolunteersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/dashboard");

  const sheets = await getProvider().getVolunteerSheets(user.id);

  const clock = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
        })
      : null;

  const day = (d: string | null) =>
    d
      ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Volunteer</h1>

      {sheets.length === 0 ? (
        <EmptyState
          icon={<HandHeart aria-hidden className="size-8" />}
          title="Nothing to sign up for yet"
          description="When the team needs help with a show your child is in — strike, load-in, concessions — the sheet appears here and you can take a slot."
        />
      ) : (
        sheets.map((sheet) => {
          const wanted = sheet.slots.reduce((a, s) => a + s.capacity, 0);
          const filled = sheet.slots.reduce((a, s) => a + s.taken, 0);
          return (
            <Card key={sheet.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {sheet.title}
                  {filled >= wanted && wanted > 0 && <Badge variant="secondary">all filled</Badge>}
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-3">
                  {sheet.onDate && (
                    <span className="flex items-center gap-1">
                      <CalendarDays aria-hidden className="size-3.5" /> {day(sheet.onDate)}
                    </span>
                  )}
                  {sheet.location && (
                    <span className="flex items-center gap-1">
                      <MapPin aria-hidden className="size-3.5" /> {sheet.location}
                    </span>
                  )}
                  <span>
                    {filled} of {wanted} filled
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col divide-y">
                {sheet.slots.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-[12rem] flex-1">
                      <div className="font-medium">{slot.title}</div>
                      {slot.startsAt && (
                        <div className="text-sm text-muted-foreground">
                          {clock(slot.startsAt)}
                          {slot.endsAt ? ` – ${clock(slot.endsAt)}` : ""}
                        </div>
                      )}
                      {slot.notes && (
                        <div className="text-sm text-muted-foreground">{slot.notes}</div>
                      )}
                      <div className="mt-1 text-sm">
                        {slot.volunteers.length === 0 ? (
                          <span className="text-muted-foreground">Nobody yet</span>
                        ) : (
                          <span>{slot.volunteers.join(", ")}</span>
                        )}
                        {slot.placesLeft > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {slot.placesLeft} {slot.placesLeft === 1 ? "place" : "places"} left
                          </span>
                        )}
                      </div>
                    </div>
                    <SlotForm
                      slotId={slot.id}
                      placesLeft={slot.placesLeft}
                      mySignupId={slot.mySignupId}
                      defaultName={user.displayName ?? ""}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
