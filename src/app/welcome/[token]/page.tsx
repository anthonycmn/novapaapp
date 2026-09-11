import Link from "next/link";
import { redirect } from "next/navigation";
import { org } from "@/config/org";
import { signInWithLoginLink } from "@/lib/auth/actions";
import { peekLoginLink } from "@/lib/auth/login-links";
import { getSessionUser } from "@/lib/auth/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export const metadata = { title: "Welcome" };

/**
 * The landing page for an office-issued sign-in link (lib/auth/login-links).
 *
 * Loading this page spends nothing. The link is used by the button, so the
 * mail scanners and link-checking proxies that fetch every URL in an inbox get
 * this page and nothing else. What they would have taken is a session.
 */
export default async function WelcomePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const supabaseMode = (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase";
  if (!supabaseMode) redirect("/login");
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const { token } = await params;
  const link = await peekLoginLink(token);

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

      {link ? (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle as="h2">
              {link.displayName ? `Welcome, ${link.displayName.split(" ")[0]}` : "Welcome"}
            </CardTitle>
            <CardDescription>
              Tap the button and you&apos;re in — no password needed. Once
              you&apos;re inside, you can choose a password for next time.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <form action={signInWithLoginLink}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit" className="w-full">
                Open my portal
              </Button>
            </form>
            <p className="text-center text-xs text-muted-foreground">
              Signing in as <strong className="font-medium">{link.email}</strong>
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle as="h2">This link has already been used or has expired</CardTitle>
            <CardDescription>
              Sign-in links open the portal once and last a week. You can set a
              password below, or write to us and we&apos;ll send a fresh one.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link href="/forgot-password" className={cn(buttonVariants(), "w-full")}>
              Set a password
            </Link>
            <a
              href={`mailto:${org.supportEmail}`}
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              Email {org.supportEmail}
            </a>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
