import Link from "next/link";
import { redirect } from "next/navigation";
import { org } from "@/config/org";
import { requestPasswordReset } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/logo";

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
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle as="h2">Check your email 📬</CardTitle>
            <CardDescription>
              If <strong>{email}</strong> has an account with us, a reset link
              is on its way. It is good for one hour. Check your spam folder if
              it hasn&apos;t landed in a few minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
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
                ? "We already have an account on that email from your registration — you just need a password on it. Send yourself a link below and pick one."
                : "Enter the email on your family account and we'll send you a link to choose a new password."}
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
                Send reset link
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
