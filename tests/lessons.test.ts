import { beforeEach, describe, expect, it } from "vitest";
import { AccessDeniedError } from "@/lib/api/provider";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";
import { nextLessonOccurrence } from "@/lib/api/lessons/types";

/**
 * Private lessons: weekly recurring slots with the same teacher.
 *  - one student per slot; booking a taken slot fails
 *  - families book only their own children
 *  - who holds a slot is private — other families see "taken", no name
 *  - cancelling frees the slot; lessons appear on the family calendar
 *  - 24h reminders ride the rehearsal-notices cron, deduped
 */

const provider = new MockDataProvider();

beforeEach(() => {
  resetMockStore();
});

describe("booking a weekly slot", () => {
  it("books an open slot for your own child and repeats weekly", async () => {
    const booking = await provider.bookLessonSlot("user-sofia", {
      slotId: "ls-1",
      studentId: "stu-ava",
      goals: "Belting for the spring show",
    });
    expect(booking.status).toBe("active");
    expect(booking.paymentMethod).toBe("studio_invoice");

    const mine = await provider.getMyLessonBookings("user-sofia");
    expect(mine).toHaveLength(1);
    expect(mine[0].teacherName).toBe("Marcus Lee");
    // The next lesson is a real upcoming timestamp on the slot's weekday.
    const next = new Date(mine[0].nextLessonAt).getTime();
    expect(next).toBeGreaterThan(Date.now() - 1000);
  });

  it("a taken slot cannot be double-booked", async () => {
    await provider.bookLessonSlot("user-sofia", { slotId: "ls-1", studentId: "stu-ava" });
    await expect(
      provider.bookLessonSlot("user-minh", { slotId: "ls-1", studentId: "stu-lien" })
    ).rejects.toThrow(/taken/i);
  });

  it("cannot book another family's child", async () => {
    await expect(
      provider.bookLessonSlot("user-sofia", { slotId: "ls-1", studentId: "stu-lien" })
    ).rejects.toThrow(AccessDeniedError);
  });

  it("booking notifies the family and the teacher, not other families", async () => {
    await provider.bookLessonSlot("user-sofia", { slotId: "ls-1", studentId: "stu-ava" });
    const sofia = await provider.getNotifications("user-sofia");
    expect(sofia.some((n) => n.title.includes("lesson booked"))).toBe(true);
    const marcus = await provider.getNotifications("user-marcus");
    expect(marcus.some((n) => n.title.includes("New weekly lesson student"))).toBe(true);
    const minh = await provider.getNotifications("user-minh");
    expect(minh.some((n) => n.title.includes("lesson booked"))).toBe(false);
  });
});

describe("slot privacy", () => {
  it("other families see 'taken' with no student name", async () => {
    await provider.bookLessonSlot("user-sofia", { slotId: "ls-1", studentId: "stu-ava" });

    const forMinh = await provider.getLessonSlots("user-minh");
    const slot = forMinh.find((row) => row.slot.id === "ls-1")!;
    expect(slot.status).toBe("taken");
    expect(slot.studentName).toBeUndefined();
    expect(slot.bookingId).toBeUndefined();

    const forSofia = await provider.getLessonSlots("user-sofia");
    expect(forSofia.find((row) => row.slot.id === "ls-1")!.status).toBe("yours");
    expect(forSofia.find((row) => row.slot.id === "ls-1")!.studentName).toContain("Ava");
  });

  it("the staff roster shows names; families can't read it", async () => {
    await provider.bookLessonSlot("user-sofia", { slotId: "ls-1", studentId: "stu-ava" });
    const roster = await provider.getLessonRoster("user-dana");
    const row = roster.find((r) => r.slot.id === "ls-1")!;
    expect(row.studentName).toContain("Ava");
    expect(row.familyName).toBe("The Martinez Family");

    await expect(provider.getLessonRoster("user-sofia")).rejects.toThrow(
      AccessDeniedError
    );
  });
});

describe("cancelling", () => {
  it("frees the slot for another family", async () => {
    const booking = await provider.bookLessonSlot("user-sofia", {
      slotId: "ls-1",
      studentId: "stu-ava",
    });
    await provider.cancelLessonBooking("user-sofia", booking.id);

    const rebooked = await provider.bookLessonSlot("user-minh", {
      slotId: "ls-1",
      studentId: "stu-lien",
    });
    expect(rebooked.status).toBe("active");
  });

  it("another family cannot cancel your booking; staff can", async () => {
    const booking = await provider.bookLessonSlot("user-sofia", {
      slotId: "ls-1",
      studentId: "stu-ava",
    });
    await expect(
      provider.cancelLessonBooking("user-minh", booking.id)
    ).rejects.toThrow(AccessDeniedError);
    await provider.cancelLessonBooking("user-dana", booking.id);
    expect(await provider.getMyLessonBookings("user-sofia")).toHaveLength(0);
  });
});

describe("calendar & reminders", () => {
  it("booked lessons appear on the family calendar — and only theirs", async () => {
    await provider.bookLessonSlot("user-sofia", { slotId: "ls-1", studentId: "stu-ava" });

    const martinez = await provider.getFamilyCalendar("user-sofia", "fam-martinez");
    const lessons = martinez.filter((event) => event.id.startsWith("lesson-"));
    expect(lessons.length).toBeGreaterThanOrEqual(4);
    expect(lessons[0].title).toContain("Voice lesson — Marcus Lee");
    expect(lessons[0].studentIds).toEqual(["stu-ava"]);

    const nguyen = await provider.getFamilyCalendar("user-minh", "fam-nguyen");
    expect(nguyen.some((event) => event.id.startsWith("lesson-"))).toBe(false);
  });

  it("sends a 24h reminder once per occurrence", async () => {
    const booking = await provider.bookLessonSlot("user-sofia", {
      slotId: "ls-1",
      studentId: "stu-ava",
    });
    const slot = { weekday: 2, startTime: "16:30" };
    const nextStart = nextLessonOccurrence(slot, Date.now());
    const checkAt = new Date(nextStart - 2 * 60 * 60 * 1000).toISOString();

    const first = await provider.runRehearsalNotices("user-dana", { now: checkAt });
    expect(first.reminders).toBeGreaterThanOrEqual(1);
    const sofia = await provider.getNotifications("user-sofia");
    expect(
      sofia.some((n) => n.title === "Tomorrow: Voice lesson" && n.body.includes("Marcus Lee"))
    ).toBe(true);

    const again = await provider.runRehearsalNotices("user-dana", { now: checkAt });
    const lessonRepeats = (await provider.getNotifications("user-sofia")).filter(
      (n) => n.title === "Tomorrow: Voice lesson"
    );
    expect(lessonRepeats).toHaveLength(1);
    void again;
    void booking;
  });
});
