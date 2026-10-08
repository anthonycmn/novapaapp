import { redirect } from "next/navigation";
import { CalendarDays, Clock, HandHeart, MapPin, Theater } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { VOLUNTEER_KINDS, asksWhatYouBring } from "@/config/volunteer-kinds";
import { STAFF_CONTACTS } from "@/config/contacts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { SlotForm } from "./slot-form";

export const metadata = { title: "Volunteer" };

/**
 * Volunteer sign-ups — the family's side of the sheets built in the staff
 * portal (hub 0048, 0096). Works the way SignUpGenius does: every slot says
 * what the help is, when, how many are wanted and how many places are left,
 * and who has already said yes.
 *
 * WHICH SHEETS. The shows this family is on, plus every sheet with no show
 * (the potluck is for everyone). Strike night for a show a family has never
 * heard of is noise.
 *
 * NAMES ARE SHOWN, and on a food slot what each person is bringing. That is
 * the question people open a sign-up sheet with — is this covered, and is
 * somebody already bringing brownies. Phone numbers, notes and badges stay
 * with the family that wrote them and with staff.
 *
 * THE 24-HOUR LINE. A place can be moved or given back here until 24 hours
 * before it starts; after that the family is pointed at the office. The
 * database holds the line — this page only chooses which buttons to show.
 */
export default async function VolunteersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/dashboard");

  const sheets = await getProvider().getVolunteerSheets(user.id);
  // Volunteering is one of the topics that routes to the family engagement
  // desk; fall back to the office if that row ever moves.
  const help =
    STAFF_CONTACTS.find((c) => /volunteer/i.test(c.forWhat))?.email ?? "info@novapa.org";

  const clock = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
        })
      : null;

  const slotDay = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "America/New_York",
    });

  const day = (d: string | null) =>
    d
      ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : null;

  const mine = sheets.flatMap((sheet) =>
    sheet.slots.filter((s) => s.mine).map((s) => ({ sheet, slot: s }))
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Volunteer</h1>
        <p className="text-sm text-muted-foreground">
          Pick a slot and sign up. You can reschedule or give back your place until 24 hours before
          it starts; after that, email{" "}
          <a className="underline" href={`mailto:${help}`}>
            {help}
          </a>
          .
        </p>
      </div>

      {mine.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your sign-ups</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {mine.map(({ sheet, slot }) => (
              <div key={slot.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{slot.mine!.volunteerName}</span>
                <span>
                  — {slot.title}, {sheet.title}
                </span>
                {slot.startsAt && (
                  <span className="text-muted-foreground">
                    {slotDay(slot.startsAt)} {clock(slot.startsAt)}
                  </span>
                )}
                {slot.mine!.bringing && (
                  <span className="text-muted-foreground">· bringing {slot.mine!.bringing}</span>
                )}
                {slot.mine!.badgeOk && (
                  <span className="text-muted-foreground">· badge: {slot.mine!.badgeName}</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {sheets.length === 0 ? (
        <EmptyState
          icon={<HandHeart aria-hidden className="size-8" />}
          title="Nothing to sign up for yet"
          description="When the team needs help — front of house, strike, food for the cast, a potluck — the sheet appears here and you can take a slot."
        />
      ) : (
        sheets.map((sheet) => {
          const wanted = sheet.slots.reduce((a, s) => a + s.capacity, 0);
          const filled = sheet.slots.reduce((a, s) => a + s.taken, 0);
          const stillNeeded = Math.max(wanted - filled, 0);
          const days = new Set(
            sheet.slots.filter((s) => s.startsAt).map((s) => slotDay(s.startsAt!))
          );
          return (
            <Card key={sheet.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {sheet.title}
                  {stillNeeded === 0 && wanted > 0 ? (
                    <Badge variant="secondary">all filled</Badge>
                  ) : (
                    <Badge>
                      {stillNeeded} {stillNeeded === 1 ? "volunteer" : "volunteers"} still needed
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Theater aria-hidden className="size-3.5" />
                    {sheet.productionTitle ?? "All families"}
                  </span>
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
                {sheet.details && (
                  <p className="whitespace-pre-line pt-1 text-sm">{sheet.details}</p>
                )}
              </CardHeader>
              <CardContent className="flex flex-col divide-y">
                {sheet.slots.map((slot) => {
                  // Where a family on this slot could move to: another slot
                  // on the same sheet with room, of a kind that does not ask
                  // for something the family has not said it is bringing.
                  const moveTargets = sheet.slots
                    .filter(
                      (o) =>
                        o.id !== slot.id &&
                        o.placesLeft > 0 &&
                        !o.mine &&
                        (!asksWhatYouBring(o.kind) || Boolean(slot.mine?.bringing))
                    )
                    .map((o) => ({
                      id: o.id,
                      label: [
                        o.title,
                        o.startsAt
                          ? `${days.size > 1 ? `${slotDay(o.startsAt)} ` : ""}${clock(o.startsAt)}`
                          : null,
                        `${o.placesLeft} left`,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                      countsFrom: o.countsFrom,
                    }));
                  return (
                    <div
                      key={slot.id}
                      className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-[12rem] flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{slot.title}</span>
                          <Badge variant="outline">
                            {VOLUNTEER_KINDS[slot.kind]?.label ?? "Other"}
                          </Badge>
                        </div>
                        {slot.startsAt && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock aria-hidden className="size-3.5" />
                            {days.size > 1 || !sheet.onDate ? `${slotDay(slot.startsAt)}, ` : ""}
                            {clock(slot.startsAt)}
                            {slot.endsAt ? ` – ${clock(slot.endsAt)}` : ""}
                          </div>
                        )}
                        {slot.notes && (
                          <div className="text-sm text-muted-foreground">{slot.notes}</div>
                        )}
                        <div className="mt-1 text-sm">
                          <span className="font-medium tabular-nums">
                            {slot.taken} of {slot.capacity} filled
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            ·{" "}
                            {slot.placesLeft > 0
                              ? `${slot.placesLeft} ${slot.placesLeft === 1 ? "spot" : "spots"} left`
                              : "full"}
                          </span>
                        </div>
                        <div className="mt-0.5 text-sm">
                          {slot.volunteers.length === 0 ? (
                            <span className="text-muted-foreground">Nobody yet</span>
                          ) : (
                            <span>
                              {slot.volunteers
                                .map((v) => (v.bringing ? `${v.name} (${v.bringing})` : v.name))
                                .join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                      <SlotForm
                        slotId={slot.id}
                        kindAsksBringing={asksWhatYouBring(slot.kind)}
                        placesLeft={slot.placesLeft}
                        countsFrom={slot.countsFrom}
                        mine={slot.mine}
                        moveTargets={moveTargets}
                        defaultName={user.displayName ?? ""}
                        helpEmail={help}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
