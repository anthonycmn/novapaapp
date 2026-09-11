"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { getSessionUser, sessionCookieName, signSession } from "./session";

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
  const site = process.env.URL ?? "https://portal.novapa.org";
  const { data, error } = await anon.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${site}/login?welcome=1` },
  });
  if (error) {
    if (/already registered/i.test(error.message)) {
      // Not an error for them to solve: they have an account but have never
      // set a password on it (the website made it during registration). Send
      // them straight to the reset flow rather than a sign-in they will fail.
      redirect(`/forgot-password?existing=1&email=${encodeURIComponent(email)}`);
    }
    redirect(`/signup?error=signup-failed&email=${encodeURIComponent(email)}`);
  }
  // With confirmations enabled Supabase returns a user but no session and
  // "identities" is empty when the email was already taken (enumeration-safe).
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    redirect(`/login?error=already-registered&email=${encodeURIComponent(email)}`);
  }
  await logActivity({
    actorEmail: email,
    action: "auth.signup_requested",
    summary: "Requested a new account — confirmation email sent",
  });
  redirect(`/signup?sent=1&email=${encodeURIComponent(email)}`);
}

/**
 * Password reset, step 1: mail a recovery link.
 *
 * Reports the same "check your email" either way, even for an address we have
 * never seen — telling a stranger which emails have accounts is the same
 * enumeration leak signUpWithEmail guards against above.
 *
 * Note this only reaches people who already HAVE an auth account. A family
 * that has never signed up gets nothing, by design: their route is /signup.
 */
export async function requestPasswordReset(formData: FormData): Promise<void> {
  if (!isSupabaseMode()) redirect("/login");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/forgot-password?error=missing-email");

  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const site = process.env.URL ?? "https://portal.novapa.org";
  await anon.auth.resetPasswordForEmail(email, {
    redirectTo: `${site}/reset-password`,
  });
  await logActivity({
    actorEmail: email,
    action: "auth.password_reset_requested",
    summary: "Asked for a password reset code",
  });
  redirect(`/forgot-password?sent=1&email=${encodeURIComponent(email)}`);
}

/**
 * Finish a reset with the six-digit code from the email (lib/auth/reset-code).
 *
 * The recovery email for this app carries a code and no link — see the
 * template's `if eq .RedirectTo` branch — because the Watsons' mail scanner
 * presses buttons. verifyOtp proves the person holds the code; the password is
 * then set through the service role, the same way /family/password does it, so
 * no recovery session ever has to survive a round trip to a browser.
 *
 * The request is never told whether the address exists. A wrong code and an
 * unknown email get the same sentence.
 */
export async function resetPasswordWithCode(formData: FormData): Promise<void> {
  if (!isSupabaseMode()) redirect("/login");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const { normalizeResetCode } = await import("./reset-code");
  const code = normalizeResetCode(String(formData.get("code") ?? ""));
  const password = String(formData.get("password") ?? "");
  const back = `/forgot-password?sent=1&email=${encodeURIComponent(email)}`;

  if (!email) redirect("/forgot-password?error=missing-email");
  if (!code) redirect(`${back}&error=code`);
  if (password.length < 8) redirect(`${back}&error=short`);

  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await anon.auth.verifyOtp({ email, token: code, type: "recovery" });
  if (error || !data.user) redirect(`${back}&error=code`);

  const { getServiceClient } = await import("@/lib/api/supabase/client");
  const { error: setError } = await getServiceClient().auth.admin.updateUserById(
    data.user.id,
    { password }
  );
  if (setError) redirect(`${back}&error=failed`);

  // The recovery session verifyOtp minted is never used again.
  await anon.auth.signOut().catch(() => undefined);
  await logActivity({
    actorEmail: email,
    action: "auth.password_reset",
    summary: "Chose a new password with a reset code",
  });
  redirect("/login?reset=1");
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
    // The play-by-play (hub 0065). Resolved through the provider because the
    // session cookie is only set below — best-effort like every log line.
    const signedIn = await getProvider().getUserById(data.user.id).catch(() => null);
    const family =
      signedIn?.familyId
        ? await getProvider().getFamily(signedIn.id, signedIn.familyId).catch(() => null)
        : null;
    await logActivity({
      user: signedIn ? { ...signedIn, family: family ?? undefined } : null,
      actorEmail: email,
      action: "auth.signed_in",
      summary: "Signed in",
    });
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

/**
 * Sign in with a one-time link the office issued (lib/auth/login-links).
 *
 * Reached by the button on /welcome/<token>, never by loading that page, so
 * whatever fetched the URL out of the inbox first did not spend it. Spent
 * first, acted on second: spendLoginLink stamps and checks in one statement.
 */
export async function signInWithLoginLink(formData: FormData): Promise<void> {
  if (!isSupabaseMode()) redirect("/login");
  const token = String(formData.get("token") ?? "");
  const { spendLoginLink } = await import("./login-links");
  const spent = token ? await spendLoginLink(token) : null;
  if (!spent) redirect("/login?error=link-expired");

  const linked = await ensureParentProfile(spent.userId, spent.email);
  if (!linked) {
    redirect(`/login?error=no-family&email=${encodeURIComponent(spent.email)}`);
  }
  const signedIn = await getProvider().getUserById(spent.userId).catch(() => null);
  const family =
    signedIn?.familyId
      ? await getProvider().getFamily(signedIn.id, signedIn.familyId).catch(() => null)
      : null;
  await logActivity({
    user: signedIn ? { ...signedIn, family: family ?? undefined } : null,
    actorEmail: spent.email,
    action: "auth.signed_in_by_link",
    summary: "Signed in with a link from the office",
  });

  const jar = await cookies();
  jar.set(sessionCookieName, signSession(spent.userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  // The link is spent. Offer a password now, while they are in, so the next
  // visit does not need the office again.
  redirect("/family/password?welcome=1");
}

/**
 * Choose a password from inside the portal (/family/password).
 *
 * Admin-set through the service role rather than through a recovery session,
 * so no email, no token and no browser-side Supabase client are involved. A
 * Chief standing in for the family may not do this for them.
 */
export async function setPassword(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/family/password");
  const welcome = formData.get("welcome") ? "&welcome=1" : "";
  if (!isSupabaseMode()) redirect(`/family/password?saved=1`);

  const { currentImpersonation } = await import("./impersonation");
  if (await currentImpersonation()) redirect("/family/password");

  const password = String(formData.get("password") ?? "");
  if (password.length < 8) redirect(`/family/password?error=short${welcome}`);

  const { getServiceClient } = await import("@/lib/api/supabase/client");
  const { error } = await getServiceClient().auth.admin.updateUserById(user.id, { password });
  if (error) redirect(`/family/password?error=failed${welcome}`);

  await logActivity({ user, action: "auth.password_set", summary: "Chose a new password" });
  redirect("/family/password?saved=1");
}

export async function signOut(): Promise<void> {
  const user = await getSessionUser().catch(() => null);
  await logActivity({ user, action: "auth.signed_out", summary: "Signed out" });
  const jar = await cookies();
  jar.delete(sessionCookieName);
  redirect("/login");
}
