/**
 * What the reset-password page should do with the link the browser arrived on.
 *
 * Pure so it can be tested without a browser or a Supabase client: the URL and
 * one boolean are the whole story, and the page reaches the same conclusion
 * from two different places (on load, and after a failed verifyOtp on Save).
 */

export type ResetLinkPlan =
  /** The scanner-proof link. Nothing spent yet; verify when they press Save. */
  | { kind: "unspent"; tokenHash: string }
  /** The stock link. Let detectSessionInUrl finish before judging it. */
  | { kind: "await_session" }
  /** The link cannot be spent, and they are not signed in. Offer a new one. */
  | { kind: "spent" }
  /** The link cannot be spent because it already worked. They are in. */
  | { kind: "already_signed_in" };

export function readResetLink(input: {
  /** window.location.search */
  search: string;
  /** window.location.hash */
  hash: string;
  /** Whether the request carried a valid app session cookie. */
  signedIn: boolean;
}): ResetLinkPlan {
  const query = new URLSearchParams(input.search.replace(/^\?/, ""));
  const unspent = query.get("token_hash");
  if (unspent && query.get("type") === "recovery") {
    return { kind: "unspent", tokenHash: unspent };
  }

  // An expired or already-used link comes back with the failure in the hash
  // rather than a token, so check that before waiting on a session.
  const hash = new URLSearchParams(input.hash.replace(/^#/, ""));
  if (hash.get("error") || hash.get("error_description")) {
    return spentLinkPlan(input.signedIn);
  }

  return { kind: "await_session" };
}

/**
 * Where a link that cannot be spent should leave the family.
 *
 * A recovery token is single use, so the most common way to see one fail is to
 * press it twice. On 20 Sep 2026 a parent asked for a link at 4:00:00 PM ET,
 * signed in with it at 4:00:13, pressed it again at 4:00:16 and was told it
 * had expired, then asked for three more links in three seconds and was rate
 * limited on every one (over_email_send_rate_limit, "you can only request this
 * after 38 seconds"). She was already signed in the whole time.
 *
 * So: if the browser holds a session, the link did not fail her, it finished.
 * Send her where she was going. The expired notice is for somebody who really
 * is locked out and needs a fresh link.
 */
export function spentLinkPlan(signedIn: boolean): ResetLinkPlan {
  return signedIn ? { kind: "already_signed_in" } : { kind: "spent" };
}
