import Link from "next/link";
import { redirect } from "next/navigation";
import { setPassword } from "@/lib/auth/actions";
import { currentImpersonation } from "@/lib/auth/impersonation";
import { getSessionUser } from "@/lib/auth/session";
import { PasswordField } from "@/components/auth/password-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Password" };

/**
 * Choose a password from inside the portal.
 *
 * The reset email is the route for a parent who is locked out. This is the
 * route for one who is already in — most often because the office sent them a
 * sign-in link (/welcome) — and it never leaves the page: no email, no
 * one-time token, nothing for a mail scanner to spend.
 */
export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; saved?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/family/password");
  const { welcome, saved, error } = await searchParams;
  const impersonating = await currentImpersonation();

  return (
    <div className="flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold">Password</h1>

      {impersonating ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This one has to be them</CardTitle>
            <CardDescription>
              You are signed in as this family, so their password is not yours
              to set. Send them a sign-in link and they can choose one in a
              moment.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : saved ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Password saved 🎭</CardTitle>
            <CardDescription>
              Next time, sign in at portal.novapa.org with{" "}
              <strong className="font-medium">{user.email}</strong> and the
              password you just chose.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard" className={cn(buttonVariants(), "w-full sm:w-auto")}>
              Go to my dashboard
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {welcome ? "You're in! Choose a password for next time" : "Choose a new password"}
            </CardTitle>
            <CardDescription>
              {welcome
                ? "The link you tapped is spent, so pick a password now and you'll be able to come straight back in whenever you like."
                : "This is the password you use to open the portal."}{" "}
              Your sign-in email stays <strong className="font-medium">{user.email}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={setPassword} className="flex flex-col gap-4">
              {welcome && <input type="hidden" name="welcome" value="1" />}
              <PasswordField id="password" name="password" label="New password" />
              {error === "short" && (
                <p role="alert" className="text-sm text-destructive">
                  Passwords need at least 8 characters.
                </p>
              )}
              {error === "failed" && (
                <p role="alert" className="text-sm text-destructive">
                  We couldn&apos;t save that password. Try a different one, or
                  message the office and we&apos;ll sort it out.
                </p>
              )}
              <Button type="submit" className="w-full sm:w-auto">
                Save password
              </Button>
              {welcome && (
                <Link
                  href="/dashboard"
                  className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline sm:text-left"
                >
                  Skip for now — take me to the portal
                </Link>
              )}
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
