import { describe, expect, it, vi } from "vitest";

// The welcome email and the route's gate, with the database and mailer
// stubbed. What must hold (CJ, 30 Sep 2026): the family gets one button that
// signs them in, the link is escaped, and nobody without the shared secret
// can make the route mint a sign-in link.

vi.mock("@/lib/api/supabase/client", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/api", () => ({ getProvider: () => ({}) }));
vi.mock("@/lib/api/registration", () => ({ getRegistrationProvider: () => ({}) }));
vi.mock("@/lib/api/registration/provision", () => ({ provisionNewWebsiteAccounts: async () => ({}) }));
vi.mock("@/lib/jobs/actor", () => ({ jobActorId: async () => null }));
vi.mock("@/lib/auth/login-links", () => ({ issueLoginLink: async () => ({ url: "x", expiresAt: new Date() }) }));
vi.mock("@/lib/api/email", () => ({ getEmailDeliveryProvider: () => ({ send: async () => ({ ok: true, id: "1" }) }) }));

import { welcomeEmail } from "@/lib/registration/front-door";

describe("front door welcome email", () => {
  it("greets by first name and carries one sign-in button", () => {
    const m = welcomeEmail({ parentName: "Sam Rivera", url: "https://portal.novapa.org/welcome/tok" });
    expect(m.subject).toBe("Welcome to your NoVAPA Parent Portal");
    expect(m.text).toContain("Hi Sam,");
    expect(m.text).toContain("https://portal.novapa.org/welcome/tok");
    expect(m.html).toContain("Open your Parent Portal");
    expect(m.html).toContain('href="https://portal.novapa.org/welcome/tok"');
  });

  it("says hello when there is no name", () => {
    expect(welcomeEmail({ parentName: "", url: "https://x" }).text.startsWith("Hello,")).toBe(true);
  });

  it("escapes the link", () => {
    const m = welcomeEmail({ parentName: "A", url: 'https://x/"><script>' });
    expect(m.html).not.toContain("<script>");
  });
});

describe("POST /api/registration/welcome", () => {
  it("refuses without the shared secret", async () => {
    process.env.REGISTRATION_WEBHOOK_SECRET = "s3cret";
    const { POST } = await import("@/app/api/registration/welcome/route");
    const req = new Request("https://portal.novapa.org/api/registration/welcome", {
      method: "POST",
      headers: { "x-registration-secret": "wrong", "content-type": "application/json" },
      body: JSON.stringify({ email: "sam@example.com" }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("refuses when the secret is not configured at all", async () => {
    delete process.env.REGISTRATION_WEBHOOK_SECRET;
    const { POST } = await import("@/app/api/registration/welcome/route");
    const req = new Request("https://x", { method: "POST", body: "{}" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await POST(req as any)).status).toBe(503);
  });
});
