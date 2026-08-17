import { headers } from "next/headers";

/**
 * The origin this request came in on, so calendar-subscription URLs can be
 * built on the server.
 *
 * They have to be absolute (webcal:// and Google's `cid=` both need a host),
 * and the string has to match what the browser would produce — building it
 * client-side from `window.location.origin` made the server render a relative
 * URL and the client an absolute one, which is a hydration mismatch that
 * throws away the whole card.
 */
export async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  // Netlify sets both x-forwarded-* headers; `next dev` sets neither.
  const proto = headerList.get("x-forwarded-proto")?.split(",")[0].trim() ?? "http";
  const host =
    headerList.get("x-forwarded-host")?.split(",")[0].trim() ??
    headerList.get("host") ??
    "localhost:3000";
  return `${proto}://${host}`;
}
