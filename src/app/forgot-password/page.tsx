import Link from "next/link";
import { redirect } from "next/navigation";
import { org } from "@/config/org";
import { requestPasswordReset, resetPasswordWithCode } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/logo";
import { PasswordField } from "@/components/auth/password-field";

export const metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    email?: string;
    sent?: string;
    existing?: string;
  }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  const supabaseMode = (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase";
  if (!supabaseMode) redirect("/login");
  const { error, email, sent, existing } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center text-center">
        <Logo size={88} standalone />
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-wide sm:text-3xl">
          {org.appName}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {org.programBrand} · schedules, photos, forms &amp; news
        </p>
      </div>

      {sent ? (
        /*
         * A code, typed here, and no link — 11 Sep 2026.
         *
         * The Watsons' mail provider opens every link in every email in a
         * headless browser a minute after it lands, and presses the buttons it
         * finds. It spent three of Kelly's reset links in one evening, through
         * the interstitial page built to stop exactly that. A link a bot can
         * press is not a credential. Six digits a person reads off one screen
         * and types into another cannot be pressed.
         *
         * So the page they asked from is the page they finish on. The email
         * carries the code and nothing to click.
         */
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle as="h2">Check your email for a code 📬</CardTitle>
            <CardDescription>
              If <strong>{email}</strong> has an account with us, a six-digit
              code is on its way. Type it below with the password you&apos;d
              like. The code is good for an hour and works once.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form action={resetPasswordWithCode} className="flex flex-col gap-4">
              <input type="hidden" name="email" value={email ?? ""} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">The code from the email</Label>
                <Input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]*"
                  maxLength={8}
                  required
                  placeholder="123456"
                  className="text-center text-xl tracking-[0.4em]"
                />
                {error === "code" && (
                  <p role="alert" className="text-sm text-destructive">
                    That code didn&apos;t match, or it has expired. Check the
                    newest email — each new request replaces the last code.
                  </p>
                )}
              </div>
              <PasswordField id="password" name="password" label="Your new password" />
              {error === "short" && (
                <p role="alert" className="text-sm text-destructive">
                  Passwords need at least 8 characters.
                </p>
              )}
              {error === "failed" && (
                <p role="alert" className="text-sm text-destructive">
                  The code was right but we couldn&apos;t save that password.
                  Please try once more, or write to {org.supportEmail}.
                </p>
              )}
              <Button type="submit" className="w-full">
                Save password and sign in
              </Button>
            </form>

            {/*
              We cannot say whether that address has an account — Supabase
              answers every request identically so nobody can discover which
              emails are registered, and we are not going to weaken that.
              What we CAN do is name the reason it is nearly always missing:
              most households gave us two addresses and only one carries the
              login, so the parent is watching the wrong inbox (27 Aug 2026).
            */}
            <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900 dark:border-amber-600/60 dark:bg-secondary dark:text-amber-100">
              <strong className="font-semibold">Nothing after five minutes?</strong>{" "}
              Check spam first. Then: your account is probably under a
              different email — plenty of families have two on file. Write to{" "}
              <a
                href={`mailto:${org.supportEmail}`}
                className="font-semibold underline underline-offset-2"
              >
                {org.supportEmail}
              </a>{" "}
              and we will tell you which one to use.
            </p>
            <form action={requestPasswordReset}>
              <input type="hidden" name="email" value={email ?? ""} />
              <Button type="submit" variant="outline" className="w-full">
                Send a new code
              </Button>
            </form>
            <Link
              href="/login"
              className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle as="h2">
              {existing ? "You already have an account" : "Reset your password"}
            </CardTitle>
            <CardDescription>
              {existing
                ? "We already have an account on that email from your registration — you just need a password on it. Send yourself a code below and pick one."
                : "Enter the email on your family account and we'll send you a six-digit code to choose a new password."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={requestPasswordReset} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  defaultValue={email ?? ""}
                  placeholder="you@example.com"
                />
                {error === "missing-email" && (
                  <p role="alert" className="text-sm text-destructive">
                    Please enter an email address.
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full">
                Send me a code
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link
                href="/login"
                className="text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
