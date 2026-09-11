"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PasswordField } from "@/components/auth/password-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Password reset, step 2 — and the app's ONLY browser-side Supabase client.
 *
 * It has to live here: Supabase puts the recovery token in the URL *hash*,
 * which browsers never send to the server, so no server component can read it.
 * supabase-js picks it up (detectSessionInUrl), holds the recovery session in
 * memory only (persistSession: false — nothing lands in localStorage), and we
 * trade it for a new password.
 *
 * The app's own signed cookie is deliberately not involved. Once the password
 * is saved we sign this throwaway session out and send them to /login, so the
 * session they end up with is minted by the normal path in actions.ts.
 *
 * One box, in the clear, no confirm, no native validation bubble: see
 * PasswordField for the parent who reached this form four times on her phone
 * and never got past it (8–9 Sep 2026).
 *
 * TWO KINDS OF LINK arrive here, and the difference is why the second exists.
 *
 * The stock Supabase link points at Supabase's own /verify endpoint, which
 * spends the one-time token on the GET and bounces here with a session in the
 * hash. Frank Watson, 10 Sep 2026: "2 minutes later she gets the email and
 * clicks the link to reset password then it errors and says the link is
 * expired." Two minutes is not the token's lifetime; it is how long Microsoft
 * takes to open every link in an inbox on the family's behalf. Safe Links did
 * the GET, Supabase spent the token, and the human got the leftovers. Anybody
 * on Outlook or Microsoft 365 — half of Northern Virginia — hits this.
 *
 * So the email template now links HERE, carrying `token_hash` in the query
 * instead of a spent session in the hash. Loading this page does nothing. The
 * token is exchanged by verifyOtp when the parent presses Save, and a scanner
 * that fetched the URL first got a form. Same idea as /welcome, and for the
 * same family.
 */

type Status = "checking" | "ready" | "saving" | "invalid" | "done";

export function ResetPasswordForm() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  /** The unspent token from a scanner-proof link. Null on the stock link. */
  const [tokenHash, setTokenHash] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: true,
        },
      }
    );
    setClient(supabase);

    // The scanner-proof link: nothing to check yet, and nothing to spend.
    // The token is verified when they press Save, not before.
    const query = new URLSearchParams(window.location.search);
    const unspent = query.get("token_hash");
    if (unspent && query.get("type") === "recovery") {
      setTokenHash(unspent);
      setStatus("ready");
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    // An expired or already-used link comes back with the failure in the hash
    // rather than a token, so check that before waiting on a session.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.get("error") || hash.get("error_description")) {
      setStatus("invalid");
      return;
    }

    let settled = false;
    const accept = () => {
      if (settled) return;
      settled = true;
      setStatus("ready");
      // Drop the token out of the address bar so it cannot be shoulder-surfed
      // or leaked by a copied URL.
      window.history.replaceState(null, "", window.location.pathname);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) accept();
    });

    // The hash may already have been consumed before the listener attached.
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        accept();
        return;
      }
      // Give detectSessionInUrl a beat to finish before calling it a dud.
      window.setTimeout(() => {
        if (!settled) setStatus("invalid");
      }, 2000);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");

    if (password.length < 8) {
      setError("Passwords need at least 8 characters.");
      return;
    }

    setError(null);
    setStatus("saving");

    // Now, and only now, spend the token. Whatever opened this page first did
    // not reach this line.
    if (tokenHash) {
      const { error: verifyError } = await client.auth.verifyOtp({
        type: "recovery",
        token_hash: tokenHash,
      });
      if (verifyError) {
        setStatus("invalid");
        return;
      }
      setTokenHash(null);
    }

    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) {
      setStatus("ready");
      // Supabase refuses a password identical to the current one. That is not
      // a failure to fix — it means the one they typed already works.
      if (/different from the old password/i.test(updateError.message)) {
        setError(
          "That is already the password on your account — you can sign in with it right now."
        );
        return;
      }
      setError(
        "We couldn't save that password. Your link may have expired — request a new one below."
      );
      return;
    }
    await client.auth.signOut();
    setStatus("done");
  }

  if (status === "checking") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle as="h2">Checking your link…</CardTitle>
          <CardDescription>One moment.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status === "invalid") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle as="h2">That link has expired</CardTitle>
          <CardDescription>
            Reset links are good for one hour and can only be used once. Ask for
            a fresh one and we&apos;ll send it straight over.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/forgot-password"
            className={cn(buttonVariants(), "w-full")}
          >
            Send a new link
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (status === "done") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle as="h2">Password saved 🎭</CardTitle>
          <CardDescription>
            You&apos;re all set. Sign in and your family&apos;s shows and
            schedule will be waiting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login?reset=1" className={cn(buttonVariants(), "w-full")}>
            Sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle as="h2">Choose a new password</CardTitle>
        <CardDescription>
          Pick something you&apos;ll remember — you&apos;ll use it every time
          you open the portal. It stays visible while you type so you can
          check it; tap Hide if someone is looking over your shoulder.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <PasswordField id="password" name="password" label="New password" />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : "Save password"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Stuck? Write to{" "}
            <a href="mailto:info@novapa.org" className="underline underline-offset-4">
              info@novapa.org
            </a>{" "}
            and we&apos;ll send you a link that signs you straight in.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
