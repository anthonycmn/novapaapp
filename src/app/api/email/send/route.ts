import { NextRequest, NextResponse } from "next/server";
import { outgoingBody } from "@/lib/email/queue";
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

/**
 * A ceiling on segments, not on recipients.
 *
 * Picking twenty of twenty-four shows is not a targeted send, it is "everyone"
 * typed the long way — and the long way costs one array scan per parent per
 * segment inside audienceParents. The empty audience already means everyone and
 * is far cheaper, so this pushes the caller at it.
 */
const MAX_AUDIENCE_SEGMENTS = 40;

/** A clean list of non-empty string ids, or null if the caller sent something else. */
function idList(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (value.some((v) => typeof v !== "string")) return null;
  return [...new Set((value as string[]).map((v) => v.trim()).filter(Boolean))];
}

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
    /** Superseded by productionIds; still accepted so an older portal build keeps working. */
    productionId?: string;
    productionIds?: unknown;
    classIds?: unknown;
    mode?: string;
    /** ISO instant to deliver at instead of now — the staff portal's Schedule field. */
    scheduledFor?: unknown;
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

  // The audience is a LIST of shows and a LIST of classes, ORed together, and
  // an empty audience still means everybody. CJ: "I want the ability to send to
  // multiple classes, not just one class at a time or multiple shows... or a
  // feature that says send to all."
  //
  // audienceParents() has always taken arrays — the single productionId was a
  // limit of this route and of the composer, not of the resolver — so this
  // widens the door rather than building a room. `productionId` is still read
  // so a portal that has not been redeployed keeps sending.
  const productionIds = idList(input.productionIds ?? (input.productionId ? [input.productionId] : []));
  const classIds = idList(input.classIds);
  if (productionIds === null || classIds === null) {
    return NextResponse.json(
      { error: "Audience must be a list of ids" },
      { status: 400, headers: corsHeaders() }
    );
  }
  if (productionIds.length + classIds.length > MAX_AUDIENCE_SEGMENTS) {
    return NextResponse.json(
      { error: `Too many segments — ${MAX_AUDIENCE_SEGMENTS} at most. Send to everyone instead.` },
      { status: 400, headers: corsHeaders() }
    );
  }

  const audience = {
    ...(productionIds.length ? { productionIds } : {}),
    ...(classIds.length ? { classIds } : {}),
  };

  /*
   * SCHEDULE IT, OR SEND IT — CJ, 28 Aug 2026, asking the staff portal for
   * "schedule send etc".
   *
   * Nothing new is being built here. sendEmail() has always taken scheduledFor
   * and written scheduled_for with sent_at left null, and the email-queue job
   * has claimed those rows every fifteen minutes since 45c767b. The hub's own
   * composer could schedule; this route — the staff portal's door into the
   * same pipeline — was the only caller that could not, so the portal's
   * composer had a Send button and nothing else.
   *
   * A SCHEDULED SEND IS THE SAME SEND. The row it writes is identical to an
   * immediate one apart from the two timestamps, and the queue merges,
   * instruments and delivers it exactly as the loop below would have. So a
   * family cannot tell, which is the point.
   *
   * A TEST IS NEVER SCHEDULED. "Send myself a test" exists to tell you now
   * whether the thing you just wrote is right; a test that arrives on Friday
   * answers a question nobody asked. scheduledFor is ignored in test mode
   * rather than refused, because the portal disables the two together anyway
   * and a 400 here would be a dead end rather than a correction.
   */
  let scheduledFor: string | undefined;
  if (mode !== "test" && input.scheduledFor != null && input.scheduledFor !== "") {
    if (typeof input.scheduledFor !== "string") {
      return NextResponse.json(
        { error: "scheduledFor must be an ISO date-time string" },
        { status: 400, headers: corsHeaders() }
      );
    }
    const at = new Date(input.scheduledFor);
    if (Number.isNaN(at.getTime())) {
      return NextResponse.json(
        { error: "scheduledFor is not a valid date-time" },
        { status: 400, headers: corsHeaders() }
      );
    }
    // A minute of slack, because the composer's clock and this one are not the
    // same clock and "9:00" pressed at 9:00 should schedule, not be refused.
    if (at.getTime() < Date.now() - 60_000) {
      return NextResponse.json(
        { error: "That time has already passed." },
        { status: 400, headers: corsHeaders() }
      );
    }
    scheduledFor = at.toISOString();
  }

  const provider = getProvider();

  const send = await provider.sendEmail(user.id, {
    subject,
    body,
    category: input.category as EmailCategory,
    audience,
    testToSelf: mode === "test",
    scheduledFor,
  });

  // Queued, not sent. The row is written; email-queue delivers it when its
  // time comes. Returning the recipient count here would be a guess — the
  // audience is resolved at delivery, on purpose, so a family who enrolls on
  // Thursday is included in a Friday send.
  if (scheduledFor) {
    return NextResponse.json(
      { sendId: send.id, recipients: 0, delivered: 0, mode: "scheduled", scheduledFor },
      { headers: corsHeaders() }
    );
  }

  const delivery = getEmailDeliveryProvider();
  const recipients =
    mode === "test" ? [user] : await provider.resolveAudience(user.id, audience);

  // {{show_title}} only has an answer when exactly one show was picked. With
  // two, there is no single right substitution and resolveMergeFields would
  // print an em dash into every message — so the portal warns before sending
  // rather than this route guessing.
  const production =
    productionIds.length === 1 ? await provider.getProduction(productionIds[0]) : null;
  // Tracking endpoints live on the hub regardless of who composed the email.
  const origin = `https://${request.headers.get("host") ?? "portal.novapa.org"}`;

  let delivered = 0;
  for (const recipient of recipients) {
    const context = {
      parent_first: recipient.displayName.split(" ")[0],
      sender_name: user.displayName,
      show_title: production?.title,
    };
    const resolvedBody = resolveMergeFields(send.body, context);
    const instrumented = instrumentEmailBody(
      resolvedBody,
      { sendId: send.id, recipientId: recipient.id },
      origin
    );
    const result = await delivery.send({
      to: recipient.email,
      subject: resolveMergeFields(send.subject, context),
      ...outgoingBody(send.body, instrumented),
      category: send.category,
    });
    if (result.ok) delivered += 1;
  }

  return NextResponse.json(
    { sendId: send.id, recipients: recipients.length, delivered, mode },
    { headers: corsHeaders() }
  );
}
