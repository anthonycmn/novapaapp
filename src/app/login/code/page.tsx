import { redirect } from "next/navigation";
import { org } from "@/config/org";
import { requestSignInCode, signInWithCode } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/logo";

export const metadata = { title: "Sign in with a code" };

/** Sign in with a code by email — no password needed. See requestSignInCode. */
export default async function CodeSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; email?: string; error?: string; next?: string }>;
}) {
  if (await getSessionUser()) redirect("/dashboard");
  const { sent, email, error, next } = await searchParams;
  const nextPath = next && /^\/[a-zA-Z0-9/_-]*$/.test(next) ? next : undefined;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center text-center">
        <Logo size={72} standalone />
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-wide">{org.appName}</h1>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle as="h2">Sign in with a code</CardTitle>
          <CardDescription>
            {sent
              ? `If ${email ?? "that address"} has an account, a code is on its way. Type it below.`
              : "No password needed. We'll email you a code."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent ? (
            <form action={requestSignInCode} className="flex flex-col gap-4">
              {nextPath && <input type="hidden" name="next" value={nextPath} />}
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
                Email me a code
              </Button>
            </form>
          ) : (
            <form action={signInWithCode} className="flex flex-col gap-4">
              <input type="hidden" name="email" value={email ?? ""} />
              {nextPath && <input type="hidden" name="next" value={nextPath} />}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Code from the email</Label>
                <Input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  placeholder="12345678"
                />
                {error === "code" && (
                  <p role="alert" className="text-sm text-destructive">
                    That code didn&apos;t match or has expired. Check the newest email, or send a new one.
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full">
                Sign in
              </Button>
              <a
                href={`/login/code${email ? `?email=${encodeURIComponent(email)}` : ""}`}
                className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Send a new code
              </a>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <a href="/login" className="text-primary underline-offset-4 hover:underline">
              Sign in with a password instead
            </a>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
