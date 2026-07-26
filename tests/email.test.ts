import { describe, expect, it } from "vitest";
import { resolveMergeFields } from "@/lib/api/email";

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
