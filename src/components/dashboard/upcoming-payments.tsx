import { CalendarClock, ExternalLink } from "lucide-react";
import { registration } from "@/config/registration";
import { fetchUpcomingPayments } from "@/lib/api/registration/billing";
import { formatCents, formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * What will be charged, and when — the schedule families kept asking for.
 *
 * Haemy Park (Aug 17, 2026): "how do I know the charges stop?" The answer the
 * registration site settled on — list EVERY remaining charge, then say out
 * loud that nothing follows the last one — is the answer here too, in the same
 * words. The data is the same endpoint's, so the two pages cannot disagree;
 * see lib/api/registration/billing.ts for the one-source rule.
 *
 * Server-rendered for this family only, streamed in behind Suspense so a slow
 * Stripe read never holds up the dashboard. No data — no plan, no link, or the
 * endpoint is having a moment — renders nothing at all, never a broken box.
 */
export async function UpcomingPaymentsPanel({ familyId }: { familyId: string }) {
  const upcoming = await fetchUpcomingPayments(familyId);
  if (!upcoming) return null;

  const [next, ...rest] = upcoming;
  const last = upcoming[upcoming.length - 1];
  const finite = last.ends !== null && !last.renews;
  const asDate = (ms: number) => formatDate(new Date(ms).toISOString());

  return (
    <Card pad={false}>
      <SectionHeader
        title="Upcoming payments"
        inCard
        right={
          <a
            href={registration.parentAccountUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Manage payment method <ExternalLink aria-hidden size={12} />
          </a>
        }
      />

      <div className="p-4">
        <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3">
          <span className="gold-band inline-flex size-9 shrink-0 items-center justify-center rounded-md border">
            <CalendarClock aria-hidden size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold tabular-nums">
              {formatCents(next.amountCents)}{" "}
              <span className="font-normal text-muted-foreground">on {asDate(next.date)}</span>
            </p>
            <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
              {next.desc}
              {next.renews ? " · renews monthly" : ""}
            </p>
          </div>
        </div>

        {rest.length > 0 && (
          <ul className="mt-2 divide-y">
            {rest.map((p, i) => (
              <li
                key={`${p.date}-${i}`}
                className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]"
              >
                <span className="tabular-nums font-medium">{formatCents(p.amountCents)}</span>
                <span className="text-muted-foreground">
                  {asDate(p.date)}
                  {p.renews ? " · renews monthly" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* The finish line, in the account page's own words — a family
            comparing the two must find them agreeing to the letter. */}
        {finite && (
          <p className="mt-3 text-[12px] text-muted-foreground">
            That last one is your final payment. Nothing is charged after it.
          </p>
        )}
        <p className="mt-1.5 text-[12px] text-muted-foreground">
          Charged automatically to your card on file. Update the card any time from your
          registration account — the schedule above comes straight from it.
        </p>
      </div>
    </Card>
  );
}
