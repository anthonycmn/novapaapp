import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { decodeTrackingToken } from "@/lib/api/email/tracking";

/**
 * Open-tracking pixel (#1). Always returns a 1×1 GIF, even for a bad token —
 * a broken image in someone's inbox helps nobody, and differing responses
 * would let an outsider probe which tokens are valid.
 */

// Smallest possible transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const ref = decodeTrackingToken(token);

  if (ref) {
    try {
      await getProvider().recordEmailOpen(ref.sendId, ref.recipientId);
    } catch {
      // Never let an analytics failure break the image.
    }
  }

  return new NextResponse(new Uint8Array(PIXEL), {
    headers: {
      "Content-Type": "image/gif",
      // Mail clients cache aggressively; this keeps repeat opens countable.
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
    },
  });
}
