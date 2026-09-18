import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An out-of-office must not read as a bounce.
 *
 * 18 Sep 2026: every notification to cj@novapa.org since the 16th showed in
 * Resend as "Bounced — Transient / General". The mail was in his mailbox. His
 * Gmail vacation responder was answering the envelope sender — a per-message
 * SES address — and SES filed each reply as a bounce it could not parse. The
 * cure is the pair of headers RFC 3834 names, on every message this adapter
 * sends; this test pins them to the wire.
 */

const KEYS = ["RESEND_API_KEY", "EMAIL_FROM_ADDRESS"] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  vi.resetModules();
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM_ADDRESS = "NoVAPA Parent Portal <notifications@portal.novapa.org>";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("the Resend adapter", () => {
  it("tells auto-responders to stay quiet on every send", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { getEmailDeliveryProvider, AUTO_RESPONDER_SUPPRESSION_HEADERS } = await import("@/lib/api/email");
    const result = await getEmailDeliveryProvider().send({
      to: "cj@novapa.org",
      subject: "Health form signed — Test Student",
      text: "signed",
      category: "health_form_submitted",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init.body)) as { headers?: Record<string, string> };
    expect(body.headers).toEqual(AUTO_RESPONDER_SUPPRESSION_HEADERS);
    expect(body.headers).toMatchObject({ Precedence: "bulk", "Auto-Submitted": "auto-generated" });
  });
});
