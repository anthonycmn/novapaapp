import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Mail, Pencil } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CopyCodeButton } from "./copy-code-button";

export const metadata = { title: "Audition submitted" };

/**
 * The page a family lands on when the form goes through.
 *
 * CJ, 8 Sep 2026: "show a loading symbol, and then I want it to go to a page
 * that says your audition has been submitted. I then want you to give them a
 * confirmation code."
 *
 * Its own route rather than a banner on the form, because a banner on a form
 * you are still looking at reads as "and now what?". This page has one job:
 * say it went through, hand over the receipt, say what happens next. The code
 * is read from the database, not carried across the redirect — so a family
 * who bookmarks this page and opens it in November sees the same code they
 * were emailed, and a refresh cannot lose it.
 */
export default async function AuditionSubmittedPage({
  params,
  searchParams,
}: {
  params: Promise<{ productionId: string; studentId: string }>;
  searchParams: Promise<{ updated?: string; emailed?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/auditions");
  const [{ productionId, studentId }, query] = await Promise.all([params, searchParams]);
  const isUpdate = query.updated === "1";
  // Set by the action when Resend refused or is not configured.
  const emailFailed = query.emailed === "0";

  const provider = getProvider();
  const [students, production, profile] = await Promise.all([
    provider.getStudentsForFamily(user.id, user.familyId),
    provider.getProduction(productionId),
    provider.getAuditionProfile(user.id, studentId, productionId),
  ]);
  const student = students.find((entry) => entry.id === studentId);
  // Nothing submitted yet means there is nothing to confirm: back to the form,
  // where the real answer to "did it go through?" is.
  if (!student || !production || !profile) {
    redirect(`/auditions/${productionId}/${studentId}`);
  }
  const displayName = student.preferredName ?? student.firstName;
  const formHref = `/auditions/${productionId}/${studentId}`;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 aria-hidden className="size-8" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">
              {isUpdate ? "Your audition has been updated" : "Your audition has been submitted"}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {displayName} — {production.title}
            </p>
          </div>

          <p className="text-sm">Thank you. The staff will review it shortly.</p>

          {/* The receipt. Large, monospace and copyable, because this is the
              one thing on the page a parent may need to read aloud or paste
              into an email later. */}
          <div className="w-full rounded-lg border bg-muted/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Confirmation code
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.15em]">
              {profile.confirmationCode ?? "—"}
            </p>
            {profile.confirmationCode && (
              <div className="mt-2">
                <CopyCodeButton code={profile.confirmationCode} />
              </div>
            )}
          </div>

          <p className="flex items-start gap-2 text-left text-sm text-muted-foreground">
            <Mail aria-hidden className="mt-0.5 size-4 shrink-0" />
            {emailFailed ? (
              <span>
                We could not email you a copy just now — that is a fault at our end, and
                your audition is safely in. Please keep the code above; it is the whole
                receipt, and quoting it is all we need if you ask us about this audition.
              </span>
            ) : (
              <span>
                We&apos;ve emailed a copy of this, with the code, to{" "}
                <strong className="text-foreground">{user.email}</strong>. Keep it with your
                records — if you ever need to ask about this audition, quote the code.
              </span>
            )}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Link href="/auditions" className={buttonVariants({ variant: "default" })}>
              Back to auditions
            </Link>
            <Link href={formHref} className={buttonVariants({ variant: "outline" })}>
              <Pencil aria-hidden /> Review or change it
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            You can change anything until auditions begin. The code stays the same.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
