import { org } from "@/config/org";

/**
 * Email delivery adapter (#1). Chosen provider: Resend (DECISIONS.md).
 * Until RESEND_API_KEY exists (NEEDS-FROM-TONY.md #2), the mock adapter
 * records sends in memory so the composer flow is fully demo-able.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  /** Plain text body; always sent, and the only body when `html` is absent. */
  text: string;
  /**
   * Optional HTML body (src/lib/email/template.ts renders these).
   *
   * Added 27 Aug 2026. Until then this adapter posted `text` alone, so the
   * portal could not send a formatted email at all — a fact hidden by
   * `email_sends` being empty, since no family had yet been mailed. Resend
   * takes both and lets the client pick, so the text stays the fallback for
   * plain-text readers rather than being replaced.
   */
  html?: string;
  category: string;
  /** Where a reply should land. Falls back to the org support mailbox. */
  replyTo?: string;
}

export interface EmailDeliveryProvider {
  send(email: OutgoingEmail): Promise<{ id: string; ok: boolean }>;
}

class MockEmailProvider implements EmailDeliveryProvider {
  public sent: OutgoingEmail[] = [];

  async send(email: OutgoingEmail): Promise<{ id: string; ok: boolean }> {
    this.sent.push(email);
    console.log(`[mock-email] → ${email.to}: ${email.subject}`);
    return { id: `mock-${this.sent.length}`, ok: true };
  }
}

/**
 * What runs in production when there is no key: nothing, loudly.
 *
 * Isabel Sok, a parent, 10 Sep 2026: "no confirmation email has been sent
 * after submission (I have a confirmation # but no email was sent)."
 *
 * She was right, and the portal did not know. Without RESEND_API_KEY the
 * factory below fell through to the mock, whose whole job is to say `ok: true`
 * and write a line to a log nobody reads — so every audition since the receipt
 * shipped recorded `receiptEmailed: true`, the confirmation page told each
 * family "we've emailed a copy", and not one message left the building. A mock
 * in production is not a fallback, it is a component that lies.
 *
 * So: never in production. `ok: false` is the truth, the caller already knows
 * what to do with it — the audition receipt treats a failed send as a saved
 * submission with no mail, which is exactly what it is — and the admin
 * dashboard says so out loud rather than waiting for a parent to notice.
 */
class UnconfiguredEmailProvider implements EmailDeliveryProvider {
  async send(email: OutgoingEmail): Promise<{ id: string; ok: boolean }> {
    console.error(
      `EMAIL NOT SENT to ${email.to} ("${email.subject}"): RESEND_API_KEY is missing ` +
        `from this deployment. On Netlify, a variable marked "secret" is not ` +
        `readable at function runtime — set it as a plain variable and redeploy.`
    );
    return { id: "", ok: false };
  }
}

class ResendEmailProvider implements EmailDeliveryProvider {
  constructor(private apiKey: string) {}

  async send(email: OutgoingEmail): Promise<{ id: string; ok: boolean }> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM_ADDRESS ?? `${org.name} <onboarding@resend.dev>`,
        to: email.to,
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
        reply_to: email.replyTo ?? org.supportEmail,
        tags: [{ name: "category", value: email.category }],
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error(`Resend send failed (${response.status}): ${detail}`);
      return { id: "", ok: false };
    }
    const data = (await response.json()) as { id: string };
    return { id: data.id, ok: true };
  }
}

let cached: EmailDeliveryProvider | null = null;

/**
 * Whether this deployment can actually send. Read by the admin dashboard, so
 * the answer is on a page rather than in a function log.
 */
export function emailDeliveryStatus(): {
  ok: boolean;
  reason?: string;
} {
  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      reason:
        "RESEND_API_KEY is missing from this deployment, so nothing is being sent. " +
        "On Netlify a variable marked \"secret\" is not readable at function runtime — " +
        "set it as a plain variable and redeploy.",
    };
  }
  if (!process.env.EMAIL_FROM_ADDRESS) {
    return {
      ok: false,
      reason:
        "EMAIL_FROM_ADDRESS is unset, so mail is sent from Resend's shared " +
        "onboarding@resend.dev address — which Resend delivers only to the account " +
        "owner's own inbox. Verify novapa.org in Resend and set the variable.",
    };
  }
  return { ok: true };
}

/** Local and demo runs mock; a real deployment never pretends. */
function isRealDeployment(): boolean {
  return (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase";
}

export function getEmailDeliveryProvider(): EmailDeliveryProvider {
  if (cached) return cached;
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    cached = new ResendEmailProvider(apiKey);
  } else {
    cached = isRealDeployment()
      ? new UnconfiguredEmailProvider()
      : new MockEmailProvider();
  }
  return cached;
}

/* ── merge fields ───────────────────────────────────────────────────────── */

export interface MergeContext {
  parent_first?: string;
  student_first?: string;
  show_title?: string;
  call_time?: string;
  sender_name?: string;
  org_name?: string;
}

/** Replace {{merge_fields}}; unknown fields render as an em-dash. */
export function resolveMergeFields(template: string, context: MergeContext): string {
  const withDefaults: Record<string, string> = {
    org_name: org.name,
    sender_name: org.shortName,
    ...Object.fromEntries(
      Object.entries(context).filter(([, value]) => value !== undefined)
    ),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    return withDefaults[key] ?? "—";
  });
}
