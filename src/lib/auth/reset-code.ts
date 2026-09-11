/**
 * The six digits a parent types back to us.
 *
 * Why a code and not a link, 11 Sep 2026: the Watsons' mail provider runs
 * every link in every email through a headless browser about a minute after
 * it lands — and presses the buttons it finds. It spent three of Kelly's reset
 * tokens in one evening, through the interstitial page built to stop exactly
 * that, and each time her own tap a few minutes later got "expired". The
 * Supabase logs have it in order: 213.159.10.29 hits /verify, 71.191.39.16
 * (their home) gets a 403. Nothing that can be clicked survives that scanner.
 * A number the human reads and types does.
 */

/** Digits only, exactly six of them, or null. Spaces and dashes are forgiven. */
export function normalizeResetCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}
