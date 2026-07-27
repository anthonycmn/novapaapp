import { notFound, redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { org, taxDetailsComplete } from "@/config/org";
import { AccessDeniedError, getProvider } from "@/lib/api";
import { FSA_AGE_LIMIT } from "@/lib/api/documents/fsa";
import { getSessionUser } from "@/lib/auth/session";
import { formatCents, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { PrintButton } from "@/components/media/print-button";

export const metadata = { title: "Dependent Care FSA statement" };

/**
 * Dependent Care FSA statement, generated automatically for students under
 * 13 (IRS Publication 503 eligibility). Printable and savable as PDF via the
 * browser's print dialog, which is what FSA administrators accept.
 */
export default async function FsaPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { studentId } = await params;
  const { year } = await searchParams;

  const taxYear = Number(year) || new Date().getFullYear();
  const period = { start: `${taxYear}-01-01`, end: `${taxYear}-12-31` };

  const provider = getProvider();
  let statement;
  try {
    statement = await provider.getFsaStatement(user.id, studentId, period);
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }

  const ready = taxDetailsComplete();

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: letter portrait; margin: 0.75in; }
              .no-print { display: none !important; }
              .fsa-sheet { box-shadow: none !important; border: none !important; padding: 0 !important; }
            }
          `,
        }}
      />

      <div className="no-print mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Dependent Care FSA statement</h1>
            <p className="text-muted-foreground">
              Tax year {taxYear} · {statement.studentName}
            </p>
          </div>
          {statement.eligible && ready && <PrintButton label="Print / save as PDF" />}
        </div>

        {!statement.eligible && (
          <Card className="border-gold/50 bg-accent">
            <CardContent className="flex items-start gap-2 p-4 text-sm text-accent-foreground">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Not eligible for this tax year</p>
                <p>{statement.ineligibleReason}</p>
                <p className="mt-1">
                  Dependent Care FSA only covers care for children under{" "}
                  {FSA_AGE_LIMIT}. If {statement.studentName.split(" ")[0]} turned{" "}
                  {FSA_AGE_LIMIT} during the year, some earlier months may still
                  qualify — ask your FSA administrator, and we can produce a
                  statement for a shorter period.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {statement.eligible && !ready && (
          <Card className="border-destructive/50">
            <CardContent className="flex items-start gap-2 p-4 text-sm">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="font-medium text-destructive">
                  Not ready to submit — missing provider tax details
                </p>
                <p className="text-muted-foreground">
                  An FSA administrator will reject a claim without the
                  provider&apos;s taxpayer ID and address. NOVA PA staff need to
                  fill these in before this statement can be used. The preview
                  below shows what it will look like.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {statement.eligible && (
        <article className="fsa-sheet mx-auto max-w-[7.5in] rounded-lg border bg-white p-8 text-black shadow-sm">
          <header className="border-b-2 border-black pb-3">
            <h2 className="text-xl font-bold">Dependent Care Statement</h2>
            <p className="text-sm">For Dependent Care Flexible Spending Account reimbursement</p>
            <p className="mt-1 text-sm">Tax year {taxYear}</p>
          </header>

          <section className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <h3 className="font-bold uppercase tracking-wide">Care provider</h3>
              <p className="mt-1 font-semibold">{org.tax.legalName || org.name}</p>
              <p>{org.tax.addressLine1 || <Missing>street address</Missing>}</p>
              {org.tax.addressLine2 && <p>{org.tax.addressLine2}</p>}
              <p>
                {org.tax.city}, {org.tax.state} {org.tax.zip || <Missing>ZIP</Missing>}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Taxpayer ID (EIN): </span>
                {org.tax.ein || <Missing>EIN</Missing>}
              </p>
              {org.tax.phone && <p>{org.tax.phone}</p>}
            </div>

            <div>
              <h3 className="font-bold uppercase tracking-wide">Dependent</h3>
              <p className="mt-1 font-semibold">{statement.studentName}</p>
              <p>Date of birth: {formatDate(`${statement.studentDateOfBirth}T12:00:00Z`)}</p>
              <p>Age at year end: {statement.ageAtPeriodEnd}</p>
              <h3 className="mt-3 font-bold uppercase tracking-wide">Paid by</h3>
              <p>{statement.guardianName}</p>
              <p>{statement.familyName}</p>
            </div>
          </section>

          <section className="mt-5">
            <h3 className="mb-2 border-b border-black/40 pb-0.5 text-sm font-bold uppercase tracking-wide">
              Care provided
            </h3>
            {statement.lineItems.length === 0 ? (
              <p className="text-sm italic">
                No payments recorded for this period.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-1">Program</th>
                    <th className="py-1">From</th>
                    <th className="py-1">To</th>
                    <th className="py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.lineItems.map((item, index) => (
                    <tr key={index} className="border-b border-black/10">
                      <td className="py-1.5">{item.description}</td>
                      <td className="py-1.5">{formatDate(`${item.startDate}T12:00:00Z`)}</td>
                      <td className="py-1.5">{formatDate(`${item.endDate}T12:00:00Z`)}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatCents(item.amountCents)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="py-2" colSpan={3}>
                      Total paid
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCents(statement.totalCents)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>

          <section className="mt-6 text-sm">
            <p>
              I certify that the above dependent care services were provided by{" "}
              {org.tax.legalName || org.name} and that the amounts shown were paid.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-6">
              <div>
                <div className="border-b border-black pb-6" />
                <p className="mt-1 text-xs">
                  {org.tax.signatoryName || <Missing>signatory</Missing>}
                  {org.tax.signatoryTitle ? `, ${org.tax.signatoryTitle}` : ""}
                </p>
              </div>
              <div>
                <div className="border-b border-black pb-6" />
                <p className="mt-1 text-xs">Date</p>
              </div>
            </div>
          </section>

          <footer className="mt-6 text-xs text-black/60">
            Generated {formatDate(statement.generatedAt)} by {org.appName}. Retain
            for your records. This statement is not tax advice; consult your FSA
            administrator or tax professional.
          </footer>
        </article>
      )}
    </>
  );
}

/** Visibly marks a gap rather than printing a blank that looks intentional. */
function Missing({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-yellow-200 px-1 font-semibold text-black">
      [{children} needed]
    </span>
  );
}
