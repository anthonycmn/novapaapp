import Link from "next/link";
import { redirect } from "next/navigation";
import { org } from "@/config/org";
import { signUpWithEmail } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/logo";

export const metadata = { title: "Create your account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string; sent?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  const supabaseMode = (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase";
  if (!supabaseMode) redirect("/login");
  const { error, email, sent } = await searchParams;

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
              We sent a confirmation link to <strong>{email}</strong>. Click it,
              then come back and sign in — your family&apos;s schedule and shows
              will be waiting.
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
            <CardTitle as="h2">Create your account</CardTitle>
            <CardDescription>
              Use the same email you registered with — that&apos;s how we find
              your family and your kids&apos; shows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={signUpWithEmail} className="flex flex-col gap-4">
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Choose a password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                {error === "weak-password" && (
                  <p role="alert" className="text-sm text-destructive">
                    Passwords need at least 8 characters.
                  </p>
                )}
                {error === "signup-failed" && (
                  <p role="alert" className="text-sm text-destructive">
                    Something went wrong creating the account. Try again, or
                    contact the office.
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full">
                Create account
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
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
