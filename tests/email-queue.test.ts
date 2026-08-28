import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailSend, FeedAudience, User } from "@/lib/api/types";
import type { OutgoingEmail } from "@/lib/api/email";
import { runEmailQueue, type QueueProvider } from "@/lib/email/queue";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";

/**
 * The delivery half of scheduled email.
 *
 * `looksLikeHtml` and `htmlToText` are covered alongside the weekly company
 * email; what is exercised here is `runEmailQueue` itself — who gets mailed,
 * how many times, and what happens when one send blows up mid-batch.
 *
 * Only the delivery provider is stubbed. Merge fields stay real, because
 * "the right parent's name reaches the right parent" is one of the things
 * under test, and stubbing it would only test the stub.
 */
const h = vi.hoisted(() => ({ sent: [] as OutgoingEmail[], sendOk: true }));

vi.mock("@/lib/api/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/email")>();
  return {
    ...actual,
    getEmailDeliveryProvider: () => ({
      async send(email: OutgoingEmail) {
        h.sent.push(email);
        return { id: "test", ok: h.sendOk };
      },
    }),
  };
});

const ORIGIN = "https://portal.novapa.org";

function user(over: Partial<User> = {}): User {
  return {
    id: "u1",
    email: "sofia@example.com",
    displayName: "Sofia Perez",
    role: "parent",
    familyId: "f1",
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function send(over: Partial<EmailSend> = {}): EmailSend {
  return {
    id: "send-1",
    subject: "Rehearsal for {{parent_first}}",
    body: "Hi {{parent_first}}, call is at 5:30 PM.",
    category: "critical",
    audience: {},
    scheduledFor: "2026-08-30T13:00:00Z",
    stats: { delivered: 0, opened: 0, total: 1 },
    createdByName: "Dana Whitfield",
    ...over,
  };
}

/**
 * A queue provider backed by plain arrays. `claimDueSends` hands its rows out
 * once and only once, mirroring the conditional update both real adapters use
 * — that is the property the last test in this file depends on.
 */
function provider(sends: EmailSend[], recipients: User[]) {
  const calls = { stats: [] as [string, number][], failed: [] as [string, string][] };
  let claimed = false;
  const queue: QueueProvider = {
    async claimDueSends() {
      if (claimed) return [];
      claimed = true;
      return sends;
    },
    async resolveAudience(_actorId: string, audience: FeedAudience) {
      if ((audience as { boom?: boolean }).boom) throw new Error("audience lookup failed");
      return recipients;
    },
    async recordSendStats(id: string, delivered: number) {
      calls.stats.push([id, delivered]);
    },
    async markSendFailed(id: string, reason: string) {
      calls.failed.push([id, reason]);
    },
  };
  return { queue, calls };
}

beforeEach(() => {
  h.sent.length = 0;
  h.sendOk = true;
});

describe("email queue (#1)", () => {
  it("mails every resolved recipient once and records the count", async () => {
    const { queue, calls } = provider(
      [send()],
      [user(), user({ id: "u2", email: "minh@example.com", displayName: "Minh Tran" })]
    );

    const result = await runEmailQueue(queue, "actor-1", ORIGIN);

    expect(result).toEqual({ claimed: 1, delivered: 2, failed: 0 });
    expect(h.sent.map((e) => e.to)).toEqual(["sofia@example.com", "minh@example.com"]);
    expect(calls.stats).toEqual([["send-1", 2]]);
  });

  it("merges each recipient's own name, not the first one's", async () => {
    const { queue } = provider(
      [send()],
      [user(), user({ id: "u2", email: "minh@example.com", displayName: "Minh Tran" })]
    );

    await runEmailQueue(queue, "actor-1", ORIGIN);

    expect(h.sent[0].subject).toBe("Rehearsal for Sofia");
    expect(h.sent[1].subject).toBe("Rehearsal for Minh");
    expect(h.sent[0].text).toContain("Hi Sofia");
    expect(h.sent[1].text).toContain("Hi Minh");
  });

  it("sends an HTML body as html plus a plain-text fallback", async () => {
    const { queue } = provider(
      [send({ body: "<p>Hi {{parent_first}}, call is at <strong>5:30 PM</strong>.</p>" })],
      [user()]
    );

    await runEmailQueue(queue, "actor-1", ORIGIN);

    expect(h.sent[0].html).toContain("<strong>5:30 PM</strong>");
    expect(h.sent[0].text).toContain("Hi Sofia, call is at 5:30 PM.");
    expect(h.sent[0].text).not.toContain("<strong>");
  });

  it("leaves html unset for a plain-text body", async () => {
    const { queue } = provider([send()], [user()]);

    await runEmailQueue(queue, "actor-1", ORIGIN);

    expect(h.sent[0].html).toBeUndefined();
  });

  it("rewrites links against the origin the cron was given", async () => {
    const { queue } = provider(
      [send({ body: "See https://portal.novapa.org/schedule for details." })],
      [user()]
    );

    await runEmailQueue(queue, "actor-1", ORIGIN);

    expect(h.sent[0].text).toContain(`${ORIGIN}/api/email/click/`);
  });

  it("counts a refused delivery as undelivered without failing the send", async () => {
    h.sendOk = false;
    const { queue, calls } = provider([send()], [user()]);

    const result = await runEmailQueue(queue, "actor-1", ORIGIN);

    expect(result).toEqual({ claimed: 1, delivered: 0, failed: 0 });
    expect(calls.stats).toEqual([["send-1", 0]]);
    expect(calls.failed).toEqual([]);
  });

  it("records a thrown send as failed and still delivers the rest of the batch", async () => {
    const bad = send({ id: "send-bad", audience: { boom: true } as FeedAudience });
    const good = send({ id: "send-good" });
    const { queue, calls } = provider([bad, good], [user()]);

    const result = await runEmailQueue(queue, "actor-1", ORIGIN);

    expect(result.failed).toBe(1);
    expect(result.delivered).toBe(1);
    expect(calls.failed).toEqual([["send-bad", "audience lookup failed"]]);
    expect(h.sent.map((e) => e.to)).toEqual(["sofia@example.com"]);
  });

  it("does nothing when nothing is due", async () => {
    const { queue, calls } = provider([], [user()]);

    const result = await runEmailQueue(queue, "actor-1", ORIGIN);

    expect(result).toEqual({ claimed: 0, delivered: 0, failed: 0 });
    expect(h.sent).toEqual([]);
    expect(calls.stats).toEqual([]);
  });

  it("delivers nothing on a second run, because the first claimed the row", async () => {
    const { queue } = provider([send()], [user()]);

    await runEmailQueue(queue, "actor-1", ORIGIN);
    const second = await runEmailQueue(queue, "actor-1", ORIGIN);

    expect(second).toEqual({ claimed: 0, delivered: 0, failed: 0 });
    expect(h.sent).toHaveLength(1);
  });
});

/**
 * The queue methods on the mock backend.
 *
 * These went missing when the queue was written: `claimDueSends` and friends
 * landed on the Supabase adapter only, while mock is the default data mode —
 * so the cron would have thrown "not a function" every fifteen minutes in any
 * environment that had not switched over. Worth holding down directly, since
 * the adapters have to agree and only one of them is exercised by tests.
 */
describe("mock provider — queue methods", () => {
  let provider: MockDataProvider;

  beforeEach(() => {
    resetMockStore();
    provider = new MockDataProvider();
  });

  const schedule = (scheduledFor: string) =>
    provider.sendEmail("user-dana", {
      subject: "Call sheet",
      body: "Call is at 5:30 PM.",
      category: "critical",
      audience: {},
      scheduledFor,
    });

  it("claims a send whose time has come, once", async () => {
    const send = await schedule("2026-08-30T13:00:00Z");
    expect(send.sentAt).toBeUndefined();

    const first = await provider.claimDueSends("2026-08-30T13:15:00Z");
    expect(first.map((s) => s.id)).toEqual([send.id]);
    expect(first[0].sentAt).toBe("2026-08-30T13:15:00Z");

    // The second run is the one that matters: overlapping crons must not
    // both deliver the same call sheet.
    const second = await provider.claimDueSends("2026-08-30T13:30:00Z");
    expect(second).toEqual([]);
  });

  it("leaves a send that is not due yet", async () => {
    await schedule("2026-08-30T13:00:00Z");
    expect(await provider.claimDueSends("2026-08-30T12:45:00Z")).toEqual([]);
  });

  it("never claims an unscheduled send", async () => {
    await provider.sendEmail("user-dana", {
      subject: "Sent now",
      body: "Immediate.",
      category: "critical",
      audience: {},
    });
    expect(await provider.claimDueSends("2026-12-31T00:00:00Z")).toEqual([]);
  });

  it("records delivered without disturbing the scheduled total", async () => {
    const send = await schedule("2026-08-30T13:00:00Z");
    const total = send.stats.total;

    await provider.recordSendStats(send.id, 3);

    const stored = (await provider.getEmailSends("user-dana")).find((s) => s.id === send.id);
    expect(stored?.stats.delivered).toBe(3);
    expect(stored?.stats.total).toBe(total);
  });

  it("puts a failure reason where staff will see it", async () => {
    const send = await schedule("2026-08-30T13:00:00Z");

    await provider.markSendFailed(send.id, "audience lookup failed");

    const stored = (await provider.getEmailSends("user-dana")).find((s) => s.id === send.id);
    expect(stored?.stats.error).toBe("audience lookup failed");
  });
});
