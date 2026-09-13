/**
 * The code a parent types back to us.
 *
 * Why a code and not a link, 11 Sep 2026: the Watsons' mail provider runs
 * every link in every email through a headless browser about a minute after
 * it lands — and presses the buttons it finds. It spent three of Kelly's reset
 * tokens in one evening, through the interstitial page built to stop exactly
 * that, and each time her own tap a few minutes later got "expired". The
 * Supabase logs have it in order: 213.159.10.29 hits /verify, 71.191.39.16
 * (their home) gets a 403. Nothing that can be clicked survives that scanner.
 * A number the human reads and types does.
 *
 * How long the number is, 13 Sep 2026: Supabase decides, not us. The project
 * is set to EIGHT digits (Authentication → Sign In / Providers → Email → "Email
 * OTP length"), and this function shipped insisting on six. Every parent who
 * typed their code correctly — Blair Winter, four codes in ten minutes; the
 * Westovers, nine — was bounced with "didn't match" before Supabase was ever
 * asked: fifteen requests, zero /verify calls in the auth log. So the only
 * rule here is "digits, and a plausible number of them" (Supabase allows 6 to
 * 10); whether they match is Supabase's question to answer.
 */

/** Digits only, 6–10 of them, or null. Spaces and dashes are forgiven. */
export function normalizeResetCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return /^\d{6,10}$/.test(digits) ? digits : null;
}
