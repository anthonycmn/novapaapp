import { org } from "@/config/org";

/**
 * Payment adapter (#11). Stripe is the chosen processor; until
 * STRIPE_SECRET_KEY exists (NEEDS-FROM-TONY.md #3) a mock adapter completes
 * the flow so checkout and admin fulfillment are fully demo-able.
 *
 * Deliberately no `stripe` npm dependency: we call the REST API directly so
 * the mock path carries zero install weight and the real path is a thin,
 * auditable fetch.
 */

export interface CheckoutLine {
  name: string;
  description?: string;
  unitAmountCents: number;
  quantity: number;
}

export interface CheckoutRequest {
  lines: CheckoutLine[];
  /** Our order reference, echoed back by the webhook. */
  orderReference: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  /** Where to send the browser to pay. */
  url: string;
  /** Processor-side id we store on the order. */
  paymentRef: string;
  /** True when no real money moved (mock adapter). */
  simulated: boolean;
}

export interface PaymentProvider {
  readonly displayName: string;
  isConfigured(): boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
}

class MockPaymentProvider implements PaymentProvider {
  readonly displayName = "Mock payments (no Stripe key)";

  isConfigured(): boolean {
    return false;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const total = request.lines.reduce(
      (sum, line) => sum + line.unitAmountCents * line.quantity,
      0
    );
    console.log(
      `[mock-payment] ${request.orderReference}: $${(total / 100).toFixed(2)} for ${request.customerEmail}`
    );
    // Land straight on the success URL so the order flow completes.
    const url = new URL(request.successUrl);
    url.searchParams.set("simulated", "1");
    return {
      url: url.toString(),
      paymentRef: `mock_pi_${request.orderReference}`,
      simulated: true,
    };
  }
}

class StripePaymentProvider implements PaymentProvider {
  readonly displayName = "Stripe";

  constructor(private readonly secretKey: string) {}

  isConfigured(): boolean {
    return Boolean(this.secretKey);
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    // Stripe's API takes form-encoded bodies with bracketed array keys.
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", request.successUrl);
    form.set("cancel_url", request.cancelUrl);
    form.set("customer_email", request.customerEmail);
    form.set("client_reference_id", request.orderReference);
    form.set("metadata[order_reference]", request.orderReference);

    request.lines.forEach((line, index) => {
      form.set(`line_items[${index}][quantity]`, String(line.quantity));
      form.set(`line_items[${index}][price_data][currency]`, "usd");
      form.set(
        `line_items[${index}][price_data][unit_amount]`,
        String(line.unitAmountCents)
      );
      form.set(`line_items[${index}][price_data][product_data][name]`, line.name);
      if (line.description) {
        form.set(
          `line_items[${index}][price_data][product_data][description]`,
          line.description
        );
      }
    });

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Stripe checkout failed (${response.status}): ${detail}`);
    }

    const session = (await response.json()) as { id: string; url: string };
    return { url: session.url, paymentRef: session.id, simulated: false };
  }
}

let cached: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  cached = key ? new StripePaymentProvider(key) : new MockPaymentProvider();
  return cached;
}

export function setPaymentProvider(provider: PaymentProvider | null): void {
  cached = provider;
}

/** Human-readable line description for a button order. */
export function describeButton(studentName: string, role: string, size: string): string {
  return `${studentName} — ${role} (${size}" button) · ${org.programBrand}`;
}
