"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { sessionCookieName, signSession } from "./session";

/**
 * Auth actions. Mock mode: sign in as a seeded demo user by email.
 * Supabase mode: real password auth against the shared novapa project,
 * plus first-time signup for families who registered on the website as
 * guests (no auth account yet).
 */

const isSupabaseMode = () =>
  (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase";

/**
 * First sign-in provisioning: a confirmed auth user without a family-hub
 * profile gets one IF their (verified) email matches a guardian from the
 * imported registration data. Email ownership is proven by Supabase's
 * confirmation + password sign-in before this ever runs.
 * Returns false when no family matches — the caller shows "contact us".
 */
async function ensureParentProfile(userId: string, email: string): Promise<boolean> {
  const { getServiceClient } = await import("@/lib/api/supabase/client");
  const db = getServiceClient();

  const { data: existing } = await db
    .from("profiles").select("id").eq("id", userId).maybeSingle();
  if (existing) return true;

  const { data: guardian } = await db
    .from("guardians")
    .select("id, family_id, full_name, user_id")
    .ilike("email", email)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!guardian) return false;

  const { error } = await db.from("profiles").insert({
    id: userId,
    email: email.toLowerCase(),
    display_name: String(guardian.full_name ?? email),
    role: "parent",
    family_id: guardian.family_id,
  });
  if (error) throw new Error(`profile provisioning failed: ${error.message}`);
  if (!guardian.user_id) {
    await db.from("guardians").update({ user_id: userId }).eq("id", guardian.id);
  }
  return true;
}

/** First-time account creation for website-registered families. */
export async function signUpWithEmail(formData: FormData): Promise<void> {
  if (!isSupabaseMode()) redirect("/login");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email) redirect("/signup?error=missing-email");
  if (password.length < 8) {
    redirect(`/signup?error=weak-password&email=${encodeURIComponent(email)}`);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const site = process.env.URL ?? "https://novapa-family-hub.netlify.app";
  const { data, error } = await anon.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${site}/login?welcome=1` },
  });
  if (error) {
    if (/already registered/i.test(error.message)) {
      redirect(`/login?error=already-registered&email=${encodeURIComponent(email)}`);
    }
    redirect(`/signup?error=signup-failed&email=${encodeURIComponent(email)}`);
  }
  // With confirmations enabled Supabase returns a user but no session and
  // "identities" is empty when the email was already taken (enumeration-safe).
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    redirect(`/login?error=already-registered&email=${encodeURIComponent(email)}`);
  }
  redirect(`/signup?sent=1&email=${encodeURIComponent(email)}`);
}

export async function signInWithEmail(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/login?error=missing-email");

  // Optional post-login destination — internal paths only, never a full URL.
  const nextRaw = String(formData.get("next") ?? "");
  const nextPath = /^\/[a-zA-Z0-9/_-]*$/.test(nextRaw) ? nextRaw : "/dashboard";

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
      if (error && /not confirmed/i.test(error.message)) {
        redirect(`/login?error=unconfirmed&email=${encodeURIComponent(email)}`);
      }
      redirect(`/login?error=bad-credentials&email=${encodeURIComponent(email)}`);
    }
    // First sign-in after signup: attach the family that registered on the
    // website with this (now verified) email. No match → no access.
    const linked = await ensureParentProfile(data.user.id, email);
    if (!linked) {
      redirect(`/login?error=no-family&email=${encodeURIComponent(email)}`);
    }
    jar.set(sessionCookieName, signSession(data.user.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    redirect(nextPath);
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
