import { redirect } from "next/navigation";
import { org } from "@/config/org";
import { signInWithEmail } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/logo";

export const metadata = { title: "Sign in" };

const DEMO_ACCOUNTS = [
  { email: "sofia@example.com", label: "Sofia Martinez — Parent (2 kids)" },
  { email: "ngozi@example.com", label: "Ngozi Okafor — Parent (2 kids)" },
  { email: "chidi@example.com", label: "Chidi Okafor — Student (13+)" },
  { email: "marcus@example.com", label: "Marcus Lee — Staff" },
  { email: "dana@example.com", label: "Dana Whitfield — Admin" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string; welcome?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  const { error, email, welcome } = await searchParams;
  const supabaseMode = (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase";

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

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle as="h2">Sign in</CardTitle>
          <CardDescription>
            {welcome
              ? "Email confirmed! Sign in below to see your family's shows."
              : "Enter the email on your family account and we'll sign you in."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signInWithEmail} className="flex flex-col gap-4">
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
              {error === "unknown-email" && (
                <p role="alert" className="text-sm text-destructive">
                  We couldn&apos;t find an account with that email. Try one of the
                  demo accounts below.
                </p>
              )}
              {error === "missing-email" && (
                <p role="alert" className="text-sm text-destructive">
                  Please enter an email address.
                </p>
              )}
            </div>
            {supabaseMode && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
                {error === "bad-credentials" && (
                  <p role="alert" className="text-sm text-destructive">
                    That email and password don&apos;t match. Try again, or
                    contact the office if you&apos;re locked out.
                  </p>
                )}
                {error === "missing-password" && (
                  <p role="alert" className="text-sm text-destructive">
                    Please enter your password.
                  </p>
                )}
                {error === "unconfirmed" && (
                  <p role="alert" className="text-sm text-destructive">
                    Almost there — click the confirmation link we emailed you,
                    then sign in.
                  </p>
                )}
                {error === "already-registered" && (
                  <p role="alert" className="text-sm text-destructive">
                    You already have an account with that email — sign in here
                    with your usual password.
                  </p>
                )}
                {error === "no-family" && (
                  <p role="alert" className="text-sm text-destructive">
                    Your email checks out, but we couldn&apos;t find a family
                    registration under it. Use the email you registered with,
                    or contact the office and we&apos;ll connect you.
                  </p>
                )}
              </div>
            )}
            <Button type="submit" className="w-full">
              {supabaseMode ? "Sign in" : "Continue"}
            </Button>
          </form>
          {supabaseMode && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              First time here?{" "}
              <a
                href="/signup"
                className="text-primary underline-offset-4 hover:underline"
              >
                Create your account
              </a>
            </p>
          )}
        </CardContent>
      </Card>

      {!supabaseMode && (
      <Card className="w-full max-w-sm border-dashed">
        <CardHeader className="pb-2">
          <CardTitle as="h2" className="text-sm text-muted-foreground">
            Demo accounts (mock data mode)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="space-y-1 text-sm">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <form action={signInWithEmail} className="inline">
                  <input type="hidden" name="email" value={account.email} />
                  <button
                    type="submit"
                    className="text-left text-primary underline-offset-4 hover:underline"
                  >
                    {account.label}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      )}
    </main>
  );
}
