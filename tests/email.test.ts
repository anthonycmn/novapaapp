import { describe, expect, it } from "vitest";
import { resolveMergeFields } from "@/lib/api/email";
import { p, renderEmailShell } from "@/lib/email/template";
import { org } from "@/config/org";

describe("merge fields (#1)", () => {
  it("resolves known fields", () => {
    const result = resolveMergeFields(
      "Dear {{parent_first}}, {{student_first}} is cast in {{show_title}}. Call: {{call_time}}.",
      {
        parent_first: "Sofia",
        student_first: "Ava",
        show_title: "Frozen Jr.",
        call_time: "5:30 PM",
      }
    );
    expect(result).toBe("Dear Sofia, Ava is cast in Frozen Jr.. Call: 5:30 PM.");
  });

  it("fills org defaults and dashes unknown fields", () => {
    const result = resolveMergeFields("{{org_name}} / {{sender_name}} / {{bogus}}", {});
    expect(result).toContain("Northern Virginia Performing Arts");
    expect(result).toContain("—");
  });

  it("tolerates whitespace inside braces", () => {
    expect(resolveMergeFields("Hi {{ parent_first }}!", { parent_first: "Minh" })).toBe(
      "Hi Minh!"
    );
  });
});

/**
 * The signature block.
 *
 * Tony, 2 Sep 2026: "add this as the confidentiality clause - do not make it
 * optional". The only thing that actually keeps it non-optional is a test:
 * renderEmailShell takes no flag for it, and this fails the moment somebody
 * adds one.
 */
describe("email signature", () => {
  const html = renderEmailShell({ preheader: "x", content: p("hello") });

  it("carries the confidentiality notice on every email", () => {
    expect(html).toContain("CONFIDENTIALITY NOTICE:");
    expect(html).toContain("Unauthorized use or disclosure is prohibited.");
  });

  it("puts the mark beside the mission, small", () => {
    expect(html).toContain(org.logoUrl);
    expect(html).toMatch(/width="28" height="28"/);
    expect(html).toContain(org.mission);
  });

  it("gives one phone number, the address, and both links", () => {
    expect(html).toContain("(571) 571-2120");
    expect(html).toContain("tel:+15715712120");
    expect(html).toContain("18945 Conference Center Drive");
    expect(html).toContain("Leesburg VA 20176");
    expect(html).toContain(org.portalUrl);
    expect(html).toContain(org.ticketsUrl);
  });

  it("orders it mission, then credentials, then the notice", () => {
    const mission = html.indexOf(org.mission);
    const address = html.indexOf("18945 Conference Center Drive");
    const notice = html.indexOf("CONFIDENTIALITY NOTICE:");
    expect(mission).toBeGreaterThan(-1);
    expect(address).toBeGreaterThan(mission);
    expect(notice).toBeGreaterThan(address);
  });
});
