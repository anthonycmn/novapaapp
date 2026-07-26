import { org } from "@/config/org";

/**
 * Email delivery adapter (#1). Chosen provider: Resend (DECISIONS.md).
 * Until RESEND_API_KEY exists (NEEDS-FROM-TONY.md #2), the mock adapter
 * records sends in memory so the composer flow is fully demo-able.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  /** Plain text body; the Resend adapter wraps it in the org template. */
  text: string;
  category: string;
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

export function getEmailDeliveryProvider(): EmailDeliveryProvider {
  if (cached) return cached;
  const apiKey = process.env.RESEND_API_KEY;
  cached = apiKey ? new ResendEmailProvider(apiKey) : new MockEmailProvider();
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
