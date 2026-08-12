"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { sessionCookieName, signSession } from "./session";

/**
 * Mock-mode auth actions: sign in as a seeded demo user by email.
 * Supabase mode replaces these with real magic-link sign-in while
 * keeping the same action signatures.
 */

const isSupabaseMode = () =>
  (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase";

export async function signInWithEmail(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/login?error=missing-email");

  const jar = await cookies();

  if (isSupabaseMode()) {
    // Real authentication: verify the password against Supabase Auth, then
    // carry a signed (unforgeable) session cookie.
    const password = String(formData.get("password") ?? "");
    if (!password) {
      redirect(`/login?error=missing-password&email=${encodeURIComponent(email)}`);
    }
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      redirect(`/login?error=bad-credentials&email=${encodeURIComponent(email)}`);
    }
    jar.set(sessionCookieName, signSession(data.user.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    redirect("/dashboard");
  }

  const user = await getProvider().getUserByEmail(email);
  if (!user) redirect(`/login?error=unknown-email&email=${encodeURIComponent(email)}`);

  jar.set(sessionCookieName, user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(sessionCookieName);
  redirect("/login");
}
