import { beforeEach, describe, expect, it } from "vitest";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";
import { emailBodyToText, sendForNotice } from "@/lib/email/full-text";

describe("a family email opens in full (Jeanette Ward, 22 Sep 2026)", () => {
  const provider = new MockDataProvider();
  beforeEach(() => resetMockStore());

  it("shows the whole email, not the 160-character preview, and only to its owner", async () => {
    const long = `Hi Families!\n\n${"Please read every word of this. ".repeat(20).trim()}\n\nThe last line.`;
    await provider.sendEmail("user-dana", {
      subject: "Notes for This Week!",
      body: long,
      category: "newsletter",
      audience: {},
    });
    const [notice] = (await provider.getNotifications("user-sofia")).filter(
      (n) => n.title === "Notes for This Week!"
    );
    expect(notice).toBeDefined();
    expect(notice.body.length).toBeLessThanOrEqual(160);

    const full = await provider.getNotificationInFull("user-sofia", notice.id);
    expect(full?.fullText).toBe(long);
    expect(await provider.getNotificationInFull("user-ngozi", notice.id)).toBeNull();
  });
});

describe("emailBodyToText", () => {
  it("keeps a plain-text email's paragraphs and every letter s", () => {
    const body = "Hi Families!\n\nA few schedule updates.\n\nThursday | NO REHEARSAL";
    expect(emailBodyToText(body)).toBe(body);
  });

  it("turns HTML into paragraphs and drops every tag", () => {
    expect(
      emailBodyToText("<p>Hi&nbsp;Families</p><p>Line one<br>Line two</p><script>x</script>")
    ).toBe("Hi Families\nLine one\nLine two\nx");
  });
});

describe("sendForNotice", () => {
  const sends = [
    { id: "a", subject: "Notes for This Week!", sentAt: "2026-09-21T01:09:11.615Z" },
    { id: "b", subject: "Notes for This Week!", sentAt: "2026-09-21T01:10:34.832Z" },
    { id: "c", subject: "Other", sentAt: "2026-09-21T01:10:00.000Z" },
    { id: "d", subject: "Notes for This Week!", sentAt: "2026-09-13T01:10:00.000Z" },
  ];

  it("picks the latest send of that subject just before the notice", () => {
    const notice = { title: "Notes for This Week!", createdAt: "2026-09-21T01:10:35.042Z" };
    expect(sendForNotice(notice, sends)?.id).toBe("b");
  });

  it("finds nothing for a notice with no matching send", () => {
    expect(
      sendForNotice({ title: "Nope", createdAt: "2026-09-21T01:10:35.042Z" }, sends)
    ).toBeUndefined();
  });
});
