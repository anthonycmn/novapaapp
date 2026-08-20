"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
 */

type Status = "checking" | "ready" | "saving" | "invalid" | "done";

export function ResetPasswordForm() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);

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
    const confirm = String(form.get("confirm") ?? "");

    if (password.length < 8) {
      setError("Passwords need at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords do not match.");
      return;
    }

    setError(null);
    setStatus("saving");
    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) {
      setStatus("ready");
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
          you open the portal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : "Save password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
