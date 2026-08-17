import { createHmac, randomBytes } from "node:crypto";

/**
 * OAuth 1.0a request signing, for SmugMug API v2.
 *
 * SmugMug never moved to OAuth 2, so every read is an HMAC-SHA1 signed request
 * (RFC 5849). This is the part that is easy to get subtly wrong and hard to
 * debug when you do — a bad signature comes back as a flat 401 with no hint
 * about which of the six steps was wrong — so each step is separated and
 * commented rather than folded into one clever expression.
 *
 * Three-legged OAuth is NOT implemented and does not need to be: NoVAPA owns
 * the galleries, so the access token is issued once against the org account and
 * lives in the environment (NEEDS-FROM-TONY #4). There is no user to redirect.
 */

export interface OAuthCredentials {
  apiKey: string;
  apiSecret: string;
  oauthToken: string;
  oauthSecret: string;
}

/**
 * RFC 3986 percent-encoding, which is NOT what encodeURIComponent does.
 *
 * encodeURIComponent leaves ! ' ( ) * alone. OAuth requires them encoded, and a
 * gallery called "Frozen Jr. (Cast A)" is exactly the kind of ordinary name
 * that turns that difference into a 401 nobody can explain.
 */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * The signature base string: METHOD & url & sorted-params.
 *
 * The query string is signed together with the OAuth parameters, and both are
 * sorted as encoded key/value pairs. The URL in the base string must carry no
 * query of its own — signing it in both places is the classic mistake here, so
 * this strips it rather than trusting every caller to have done so. Callers
 * still have to put the query parameters into `params`; dropping them silently
 * would be the same bug wearing a different hat.
 */
export function baseString(
  method: string,
  url: string,
  params: Record<string, string>
): string {
  const bare = url.split("?")[0];

  const encoded = Object.entries(params)
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  return [
    method.toUpperCase(),
    percentEncode(bare),
    percentEncode(encoded),
  ].join("&");
}

/**
 * The Authorization header for one GET.
 *
 * `url` may carry a query string; it is split off, signed alongside the OAuth
 * parameters, and left on the request as-is.
 */
export function authorizationHeader(
  creds: OAuthCredentials,
  method: string,
  url: string,
  nonce = randomBytes(16).toString("hex"),
  timestamp = Math.floor(Date.now() / 1000).toString()
): string {
  const parsed = new URL(url);
  const bare = `${parsed.origin}${parsed.pathname}`;

  const query: Record<string, string> = {};
  parsed.searchParams.forEach((v, k) => {
    query[k] = v;
  });

  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_token: creds.oauthToken,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_nonce: nonce,
    oauth_version: "1.0",
  };

  const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.oauthSecret)}`;
  const signature = createHmac("sha1", signingKey)
    .update(baseString(method, bare, { ...query, ...oauth }))
    .digest("base64");

  // Only the oauth_* parameters go in the header — query parameters were signed
  // but stay in the URL.
  const header = { ...oauth, oauth_signature: signature };
  return (
    "OAuth " +
    Object.entries(header)
      .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
      .join(", ")
  );
}
