/**
 * The receipt a family gets for an audition submission.
 *
 * In Supabase mode the DATABASE mints this (hub 0074, a before-insert trigger)
 * so a code exists the instant the row does, whoever wrote it. This is the
 * same recipe in TypeScript for the mock provider and the tests — and it is
 * kept identical on purpose, so a code shown in a demo looks like a code
 * shown to a family.
 *
 * Why this alphabet: a parent reads this off a phone to somebody on a phone.
 * 0/O, 1/I/L, 5/S, 8/B and 9 are gone because they are the pairs people mishear
 * or misread, and a code that cannot be confused is worth more than one that
 * packs a few more bits. Eight letters from twenty-seven is 2.8e11 codes
 * against a few hundred submissions a season.
 */
export const CONFIRMATION_ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ23467";

export const CONFIRMATION_CODE_PATTERN = /^AUD-[A-Z2-7]{4}-[A-Z2-7]{4}$/;

export function makeConfirmationCode(random: () => number = Math.random): string {
  let raw = "";
  for (let i = 0; i < 8; i += 1) {
    const index = Math.floor(random() * CONFIRMATION_ALPHABET.length);
    raw += CONFIRMATION_ALPHABET[Math.min(index, CONFIRMATION_ALPHABET.length - 1)];
  }
  return `AUD-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}
