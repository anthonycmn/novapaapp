import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { decodeTrackingToken } from "@/lib/api/email/tracking";

/**
 * Click tracking (#1): record, then redirect on to the real destination.
 *
 * The destination is validated before redirecting. An open redirect here
 * would let someone send a phishing link that appears to come from the
 * organization's own domain, so only http(s) URLs are followed and anything
 * else lands on the app instead.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const target = request.nextUrl.searchParams.get("url");

  let destination: URL | null = null;
  if (target) {
    try {
      const parsed = new URL(target);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        destination = parsed;
      }
    } catch {
      destination = null;
    }
  }

  const ref = decodeTrackingToken(token);
  if (ref && destination) {
    try {
      await getProvider().recordEmailClick(ref.sendId, ref.recipientId, destination.toString());
    } catch {
      // Recording must never block the person from reaching the page.
    }
  }

  return NextResponse.redirect(destination ?? new URL("/dashboard", request.nextUrl.origin));
}
