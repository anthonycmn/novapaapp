import { ExternalLink } from "lucide-react";
import { registration } from "@/config/registration";
import type { ClassOffering, Enrollment, Production, Student } from "@/lib/api/types";
import type { UpcomingPayment } from "@/lib/api/registration/billing";
import { formatCents, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Current enrollments on the family dashboard (#8), with deep links out to
 * the registration system for new signups and outstanding balances.
 *
 * THE PILL TELLS STRIPE'S TRUTH, NOT THE LEDGER'S. A family on a payment
 * plan used to read "Paid" on every show, because plans live in Stripe and
 * the synced balance column never hears about them — a migrated plan has no
 * order at all, and a checkout plan's balance goes stale the moment the
 * first installment charges (installments are never written back; see the
 * RegistrationRevenue note in the staff portal). CJ, 5 Sep 2026, logged in
 * as the Park family: three "Paid" pills over a plan with $1,381.73 still
 * to run. So:
 *
 *   upcoming = [...]   → the family pays installments: every pill says so,
 *                        with the next pull date. Family-level on purpose —
 *                        Stripe knows the plan, not which show it covers.
 *   upcoming = null    → verified no plan: balance > 0 is "due", else Paid.
 *   upcoming undefined → still checking (the Suspense fallback): show a
 *                        recorded balance if there is one, and NOTHING
 *                        instead of "Paid" — never show the claim before
 *                        the verification.
 */
export function EnrollmentsCard({
  enrollments,
  students,
  productions,
  classes,
  upcoming,
}: {
  enrollments: Enrollment[];
  students: Student[];
  productions: Production[];
  classes: ClassOffering[];
  upcoming?: UpcomingPayment[] | null;
}) {
  const active = enrollments.filter((e) => e.status !== "withdrawn");
  const studentsById = new Map(students.map((s) => [s.id, s]));
  const productionsById = new Map(productions.map((p) => [p.id, p]));
  const classesById = new Map(classes.map((c) => [c.id, c]));

  const totalBalance = active.reduce((sum, e) => sum + e.balanceCents, 0);
  const onPlan = Array.isArray(upcoming) && upcoming.length > 0;
  const verifiedNoPlan =
    upcoming === null || (Array.isArray(upcoming) && upcoming.length === 0);
  const next = onPlan ? upcoming[0] : null;
  // "Left on the plan" counts the finite installments; an open membership's
  // next renewal is not money "left" — it renews forever until cancelled.
  const finiteRows = onPlan ? upcoming.filter((p) => !p.renews) : [];
  const planRemainingCents = finiteRows.reduce((sum, p) => sum + p.amountCents, 0);
  const nextDate = next ? formatDate(new Date(next.date).toISOString()) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Enrollments</CardTitle>
        <CardDescription>
          Synced from registration. Sign up for more any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active enrollments yet — browse classes and productions to get
            started.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((enrollment) => {
              const student = studentsById.get(enrollment.studentId);
              const production = enrollment.productionId
                ? productionsById.get(enrollment.productionId)
                : undefined;
              const offering = enrollment.classId
                ? classesById.get(enrollment.classId)
                : undefined;
              const title = production?.title ?? offering?.name ?? "Enrollment";

              return (
                <li
                  key={enrollment.id}
                  className="flex items-start justify-between gap-2 border-b pb-2 text-sm last:border-b-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{title}</p>
                    <p className="text-muted-foreground">
                      {student?.preferredName ?? student?.firstName}
                      {enrollment.status === "waitlisted" && " · waitlisted"}
                    </p>
                  </div>
                  {onPlan ? (
                    <Badge variant="gold" className="shrink-0">
                      {finiteRows.length > 0 ? "Installments" : "Autopay"} · next {nextDate}
                    </Badge>
                  ) : enrollment.balanceCents > 0 ? (
                    <Badge variant="gold" className="shrink-0">
                      {formatCents(enrollment.balanceCents)} due
                    </Badge>
                  ) : verifiedNoPlan ? (
                    <Badge variant="secondary" className="shrink-0">
                      Paid
                    </Badge>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {onPlan && next && (
          /* The statement line — how much is left, and what happens next,
             said the way a card statement with autopay would say it. */
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground">
            {finiteRows.length > 0 ? (
              <>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatCents(planRemainingCents)}
                </span>{" "}
                left on your payment plan · next automatic withdrawal{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatCents(next.amountCents)}
                </span>{" "}
                on {nextDate}. No action needed.
              </>
            ) : (
              <>
                Your membership renews automatically — next withdrawal{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatCents(next.amountCents)}
                </span>{" "}
                on {nextDate}. No action needed.
              </>
            )}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {/* A plan family's synced balance is stale by design (installments
              never write back), so the pay button only shows where the
              balance is real: no plan on file. */}
          {!onPlan && upcoming !== undefined && totalBalance > 0 && (
            <a
              href={registration.parentAccountUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Pay {formatCents(totalBalance)} balance
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
          )}
          {onPlan && (
            <a
              href={registration.parentAccountUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-accent"
            >
              View your payment schedule
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
          )}
          <a
            href={registration.registrationLandingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-accent"
          >
            Register for a class
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
