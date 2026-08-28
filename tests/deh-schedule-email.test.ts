import { describe, expect, it } from "vitest";
import {
  DEH_SCHEDULE,
  STUDENT_CALL,
  dayLabel,
  renderDehEmail,
  renderDehSubject,
  scheduleRange,
  type DehDay,
  type DehMeta,
  type DehRecipient,
} from "@/lib/email/deh-schedule";
import { htmlToText, looksLikeHtml } from "@/lib/email/queue";

const META: DehMeta = {
  portalUrl: "https://portal.novapa.org",
  venue: "Franklin Park Arts Center",
};

const RECIPIENT: DehRecipient = {
  studentName: "Leah Vepraskas",
  to: ["sarah.s.vepraskas@gmail.com", "matt.vepraskas@gmail.com"],
  guardianNames: ["Sarah Vepraskas", "Matt Vepraskas"],
};

describe("the schedule itself", () => {
  it("runs the 23rd through the 27th, in order", () => {
    expect(DEH_SCHEDULE.map((day) => day.date)).toEqual([
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
  });

  it("calls students at 5:30 PM every single day", () => {
    for (const day of DEH_SCHEDULE) expect(day.studentCall).toBe(STUDENT_CALL);
  });

  it("puts load-in on a Wednesday — the reading that fixes the month", () => {
    expect(dayLabel("2026-09-23")).toBe("Wednesday, September 23");
    expect(dayLabel("2026-09-27")).toBe("Sunday, September 27");
  });

  it("labels a date by its Eastern day, not the UTC one it would roll into", () => {
    // A naive `new Date("2026-09-23")` is midnight UTC — 8pm on the 22nd here.
    expect(dayLabel("2026-09-23")).not.toContain("22");
  });
});

describe("scheduleRange", () => {
  it("reads as one span", () => {
    expect(scheduleRange()).toBe("September 23 – 27");
  });

  it("does not print a range for a single day", () => {
    const one: DehDay[] = [DEH_SCHEDULE[0]];
    expect(scheduleRange(one)).toBe("September 23");
  });
});

describe("renderDehEmail", () => {
  const { subject, html } = renderDehEmail(RECIPIENT, META);

  it("puts the call time in the subject, where a phone shows it", () => {
    expect(subject).toContain("5:30 PM");
    expect(subject).toContain("Leah Vepraskas");
    expect(renderDehSubject(RECIPIENT)).toBe(subject);
  });

  it("says the call time before it says any production window", () => {
    const text = htmlToText(html);
    expect(text.indexOf("not called until 5:30 PM")).toBeGreaterThan(-1);
    expect(text.indexOf("not called until 5:30 PM")).toBeLessThan(
      text.indexOf("production window")
    );
  });

  it("repeats the call time on every day, so no row can be read alone and misread", () => {
    const rows = htmlToText(html).match(/Student call 5:30 PM/g) ?? [];
    expect(rows).toHaveLength(DEH_SCHEDULE.length);
  });

  it("never presents a production window as a call time", () => {
    const text = htmlToText(html);
    for (const day of DEH_SCHEDULE) {
      const start = day.window.split("–")[0].trim();
      expect(text).not.toContain(`Student call ${start}`);
    }
  });

  it("is HTML the queue will recognize and can flatten to text", () => {
    expect(looksLikeHtml(html)).toBe(true);
    expect(htmlToText(html)).toContain("Franklin Park Arts Center");
  });

  it("carries bgcolor beside every background, for Gmail's compose pipeline", () => {
    const backgrounds = html.match(/background:#[0-9a-f]{6}/gi) ?? [];
    const bgcolors = html.match(/bgcolor="#[0-9a-f]{6}"/gi) ?? [];
    expect(backgrounds.length).toBeGreaterThan(0);
    expect(bgcolors.length).toBeGreaterThan(0);
  });

  it("escapes a student name rather than letting it become markup", () => {
    const { html: escaped } = renderDehEmail(
      { ...RECIPIENT, studentName: 'Kai <script>"' },
      META
    );
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
  });

  it("names the show in the footer, so a forwarded copy still explains itself", () => {
    expect(htmlToText(html)).toContain("is in the Dear Evan Hansen company");
  });
});
