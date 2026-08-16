import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { getEmailDeliveryProvider, resolveMergeFields } from "@/lib/api/email";
import { instrumentEmailBody } from "@/lib/api/email/tracking";
import type { EmailCategory } from "@/lib/api/types";
import { corsHeaders, userFromBearer } from "@/lib/auth/portal-bridge";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";

/**
 * Send a family email — the staff portal's door into the same pipeline the
 * hub's own /admin/email composer uses (sendEmailAction): record the send,
 * resolve the audience, merge fields per recipient, instrument for
 * open/click tracking, deliver through the adapter (Resend when the key is
 * present, mock otherwise).
 *
 * mode 'test' delivers ONLY to the caller themselves — the portal's "send
 * myself a test" button — and is the recommended first step for any new
 * message. Tracking links point at THIS host, because the open/click
 * endpoints live here regardless of which portal composed the message.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

const CATEGORIES = new Set(["critical", "casting", "payment", "newsletter", "fundraising"]);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  const user = (await getSessionUser()) ?? (await userFromBearer(request));
  if (!user || !hasRoleAtLeast(user, "staff")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  let input: {
    subject?: string;
    body?: string;
    category?: string;
    productionId?: string;
    mode?: string;
  };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: corsHeaders() });
  }

  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  const mode = input.mode === "test" ? "test" : "send";
  if (!subject || subject.length > 200 || !body || body.length > 50_000) {
    return NextResponse.json(
      { error: "Subject and body are required" },
      { status: 400, headers: corsHeaders() }
    );
  }
  if (!CATEGORIES.has(input.category ?? "")) {
    return NextResponse.json(
      { error: "Unknown category" },
      { status: 400, headers: corsHeaders() }
    );
  }

  const provider = getProvider();
  const audience = input.productionId ? { productionIds: [input.productionId] } : {};

  const send = await provider.sendEmail(user.id, {
    subject,
    body,
    category: input.category as EmailCategory,
    audience,
    testToSelf: mode === "test",
  });

  const delivery = getEmailDeliveryProvider();
  const recipients =
    mode === "test" ? [user] : await provider.resolveAudience(user.id, audience);
  const production = input.productionId
    ? await provider.getProduction(input.productionId)
    : null;
  // Tracking endpoints live on the hub regardless of who composed the email.
  const origin = `https://${request.headers.get("host") ?? "novapa-family-hub.netlify.app"}`;

  let delivered = 0;
  for (const recipient of recipients) {
    const context = {
      parent_first: recipient.displayName.split(" ")[0],
      sender_name: user.displayName,
      show_title: production?.title,
    };
    const resolvedBody = resolveMergeFields(send.body, context);
    const result = await delivery.send({
      to: recipient.email,
      subject: resolveMergeFields(send.subject, context),
      text: instrumentEmailBody(
        resolvedBody,
        { sendId: send.id, recipientId: recipient.id },
        origin
      ),
      category: send.category,
    });
    if (result.ok) delivered += 1;
  }

  return NextResponse.json(
    { sendId: send.id, recipients: recipients.length, delivered, mode },
    { headers: corsHeaders() }
  );
}
