"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { sessionCookieName } from "./session";

/**
 * Mock-mode auth actions: sign in as a seeded demo user by email.
 * Supabase mode replaces these with real magic-link sign-in while
 * keeping the same action signatures.
 */

export async function signInWithEmail(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/login?error=missing-email");

  const user = await getProvider().getUserByEmail(email);
  if (!user) redirect(`/login?error=unknown-email&email=${encodeURIComponent(email)}`);

  const jar = await cookies();
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
