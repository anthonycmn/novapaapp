"use client";

import { useState } from "react";
import { CreditCard, Ticket } from "lucide-react";
import { buyCoachingAction } from "@/lib/actions/coaching";
import type { CoachingPackageOffer } from "@/lib/api/coaching/offers";
import { formatCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BookableStudent } from "./booking-form";

/**
 * Buying a package of sessions.
 *
 * The per-session price is shown next to the total because that is the number
 * a parent is actually comparing — a 10-pack at $1,050 is only obviously
 * better than a single at $120 once somebody has done the division, and
 * making a parent do arithmetic to find the discount hides the discount.
 *
 * No price is submitted. The form carries a package id and a performer; what
 * it costs is read from the price list inside the database, so what Stripe
 * charges cannot be edited in a browser.
 */
export function BuySessions({
  offers,
  students,
  error,
  paymentsConfigured,
}: {
  offers: CoachingPackageOffer[];
  students: BookableStudent[];
  error?: string;
  /** False when no Stripe key is set — see the guard in buyCoachingAction. */
  paymentsConfigured: boolean;
}) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [chosen, setChosen] = useState("");

  if (offers.length === 0 || students.length === 0) return null;

  // Packages are on sale but there is no processor to take the money. Say so,
  // rather than showing a button that refuses when pressed.
  if (!paymentsConfigured) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-2 p-4">
          <p className="flex items-center gap-2 font-medium">
            <Ticket className="size-4" />
            Coaching packages
          </p>
          <p className="text-sm text-muted-foreground">
            Card payments aren&apos;t switched on yet. Message the office and we
            will set your package up for you.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="flex items-center gap-2 font-medium">
          <Ticket className="size-4" />
          Buy coaching sessions
        </p>

        <form action={buyCoachingAction} className="flex flex-col gap-3">
          {students.length > 1 ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Who is this for?</span>
              <select
                name="studentId"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                className="rounded-md border bg-background px-3 py-2"
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="studentId" value={students[0].id} />
          )}

          <input type="hidden" name="menuId" value={chosen} />

          <fieldset className="flex flex-col gap-1.5">
            <legend className="sr-only">Choose a package</legend>
            {offers.map((offer) => {
              const selected = offer.menuId === chosen;
              const each = Math.round(offer.priceCents / offer.sessions);
              return (
                <button
                  key={offer.menuId}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setChosen(selected ? "" : offer.menuId)}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                    selected ? "border-primary bg-accent" : "hover:bg-accent"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{offer.service}</span>
                    <span className="block text-xs text-muted-foreground">
                      {offer.sessions} session{offer.sessions === 1 ? "" : "s"}
                      {offer.sessions > 1 && ` · ${formatCents(each)} each`}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatCents(offer.priceCents)}
                  </span>
                </button>
              );
            })}
          </fieldset>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={!chosen} className="self-start">
            <CreditCard className="size-4" />
            {chosen ? "Continue to payment" : "Choose a package"}
          </Button>

          <p className="text-xs text-muted-foreground">
            Payment is taken securely by Stripe. Your sessions appear here as
            soon as it goes through, ready to book.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
