import { beforeEach, describe, expect, it } from "vitest";
import { getProvider } from "@/lib/api";
import { PerformanceService, easternToUtc, termsMd5 } from "@/lib/performance/service";
import { MockPerformanceRepo, mockReset, mockSetSignupClose, mockState } from "@/lib/performance/repo-mock";
import type { SessionUser } from "@/lib/api/types";

/**
 * The family side of Performance Events, end to end on the mock repository:
 * the same service the pages call, the same rules the database runs.
 */

const service = new PerformanceService(new MockPerformanceRepo());

async function as(id: string): Promise<SessionUser> {
  const user = await getProvider().getUserById(id);
  if (!user) throw new Error(`no ${id}`);
  return user as SessionUser;
}

async function completeSolo(user: SessionUser, eventId: string, studentId: string) {
  const actId = await service.startAct(user, eventId, studentId);
  await service.saveAct(user, actId, { actType: "song", actFormat: "solo", title: "Let It Go", runtimeSeconds: 200, contentOk: true });
  await service.acceptTerms(user, actId, true);
  return actId;
}

describe("performance sign-up flow (mock)", () => {
  beforeEach(() => mockReset());

  it("walks a solo from start to submitted, with the rehearsal answered", async () => {
    const sofia = await as("user-sofia");
    const actId = await completeSolo(sofia, "pe-cabaret", "stu-ava");
    let result = await service.submit(sofia, actId);
    expect(result).toMatchObject({ ok: false, message: "Answer every required rehearsal, and explain any conflict." });

    await service.setRehearsals(sofia, actId, [{ rehearsalId: "pe-cabaret-r1", available: true }]);
    result = await service.submit(sofia, actId);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("submitted");

    const page = await service.getEventPage(sofia, "pe-cabaret");
    expect(page?.myActs.map((a) => a.status)).toEqual(["submitted"]);
  });

  it("blocks a required video until it is there, then accepts straight in (everyone performs)", async () => {
    const sofia = await as("user-sofia");
    const actId = await completeSolo(sofia, "pe-anniversary", "stu-ava");
    // headshot and bio are required on this event too
    const act = (await service.getActPage(sofia, actId))!.act;
    await service.attachFile(sofia, actId, "headshot", { dataUrl: "data:image/jpeg;base64,AAAA", extension: ".jpg" }, "ava.jpg", act.performers[0].id);
    await service.updatePerformer(sofia, actId, act.performers[0].id, { bio: "Ava is in Frozen JR." });
    expect((await service.submit(sofia, actId)).message).toBe("Add a performance video link.");

    await expect(service.saveAct(sofia, actId, { videoUrl: "not a link" })).rejects.toThrow("That does not look like a link.");
    await service.saveAct(sofia, actId, { videoUrl: "https://youtu.be/abc" });
    const result = await service.submit(sofia, actId);
    expect(result).toMatchObject({ ok: true, status: "accepted" });
  });

  it("does not ask for a video the event switched off", async () => {
    const sofia = await as("user-sofia");
    mockState().events.find((e) => e.id === "pe-cabaret")!.reqVideo = "off";
    const actId = await completeSolo(sofia, "pe-cabaret", "stu-ava");
    await service.saveAct(sofia, actId, { videoUrl: "https://youtu.be/abc" });
    expect((await service.getActPage(sofia, actId))!.act.videoUrl).toBeUndefined();
  });

  it("keeps the anniversary showcase to Frozen JR. students", async () => {
    const ngozi = await as("user-ngozi");
    // Amara takes a class but is in no show.
    await expect(service.startAct(ngozi, "pe-anniversary", "stu-amara")).rejects.toThrow(/not eligible/);
  });

  it("runs a duet across two families: invite, confirm, and the address stays private", async () => {
    const sofia = await as("user-sofia");
    const ngozi = await as("user-ngozi");
    const actId = await service.startAct(sofia, "pe-cabaret", "stu-ava");
    await service.saveAct(sofia, actId, { actType: "song", actFormat: "duet", title: "For the First Time", runtimeSeconds: 180, contentOk: true });

    await service.inviteFamily(sofia, actId, "NGOZI@example.com");
    // The duet is full now; a third invite is refused for that reason alone.
    await expect(service.inviteFamily(sofia, actId, "nobody@nowhere.example")).rejects.toThrow(/as many performers/);

    const invited = await service.getEventPage(ngozi, "pe-cabaret");
    expect(invited?.invites).toHaveLength(1);
    expect(invited?.invites[0].invitedByFamilyName).toBe("The Martinez Family");

    const performerId = invited!.invites[0].performerId;
    const result = await service.answerInvite(ngozi, performerId, true, "stu-chidi");
    expect(result.ok).toBe(true);

    const sofiaView = (await service.getActPage(sofia, actId))!.act;
    expect(sofiaView.performers.map((p) => p.inviteStatus)).toEqual(["confirmed", "confirmed"]);

    // Ngozi sees the act, her own student in full, and nothing of Sofia's contact details.
    const ngoziView = await service.getActPage(ngozi, actId);
    expect(ngoziView?.mine).toBe(false);
    const ava = ngoziView!.act.performers.find((p) => p.studentId === "stu-ava" || p.programName?.startsWith("Ava"));
    expect(ava?.guardianEmail).toBeUndefined();
    expect(ava?.guardianPhone).toBeUndefined();

    // Ngozi can complete her own student's bio, not Ava's.
    const chidi = ngoziView!.act.performers.find((p) => p.studentId === "stu-chidi")!;
    await service.updatePerformer(ngozi, actId, chidi.id, { bio: "Chidi beatboxes." });
    await expect(service.updatePerformer(ngozi, actId, ava!.id, { bio: "x" })).rejects.toThrow(/another family/);
  });

  it("lets the submitting family send an invite before it is confirmed", async () => {
    const sofia = await as("user-sofia");
    const actId = await service.startAct(sofia, "pe-cabaret", "stu-ava");
    await service.saveAct(sofia, actId, { actType: "song", actFormat: "duet", title: "Duet", runtimeSeconds: 150, contentOk: true });
    await service.inviteFamily(sofia, actId, "someone@example.com");
    await service.acceptTerms(sofia, actId, true);
    await service.setRehearsals(sofia, actId, [{ rehearsalId: "pe-cabaret-r1", available: false, conflictNote: "Away" }]);
    expect((await service.submit(sofia, actId)).status).toBe("submitted");
  });

  it("refuses an invitation answer from a family whose address was not invited", async () => {
    const sofia = await as("user-sofia");
    const minh = await as("user-minh");
    const actId = await service.startAct(sofia, "pe-cabaret", "stu-ava");
    await service.saveAct(sofia, actId, { actFormat: "duet" });
    await service.inviteFamily(sofia, actId, "ngozi@example.com");
    const performerId = (await service.getActPage(sofia, actId))!.act.performers[1].id;
    expect((await service.answerInvite(minh, performerId, true, "stu-lien")).ok).toBe(false);
  });

  it("edits after submitting, withdraws, and stops edits once the deadline passes", async () => {
    const sofia = await as("user-sofia");
    const actId = await completeSolo(sofia, "pe-cabaret", "stu-ava");
    await service.setRehearsals(sofia, actId, [{ rehearsalId: "pe-cabaret-r1", available: true }]);
    await service.submit(sofia, actId);

    await service.saveAct(sofia, actId, { title: "Into the Unknown" });
    expect((await service.getActPage(sofia, actId))!.act.title).toBe("Into the Unknown");

    mockSetSignupClose("pe-cabaret", new Date(Date.now() - 60_000).toISOString());
    await expect(service.saveAct(sofia, actId, { title: "Late" })).rejects.toThrow(/closed/);
    expect((await service.getActPage(sofia, actId))!.editable).toBe(false);
    await expect(service.startAct(sofia, "pe-cabaret", "stu-leo")).rejects.toThrow(/not open/);

    // Withdrawing stays open after the deadline.
    expect((await service.withdraw(sofia, actId)).ok).toBe(true);
    expect((await service.getActPage(sofia, actId))!.act.status).toBe("withdrawn");
  });

  it("holds the per-student cap across acts", async () => {
    const sofia = await as("user-sofia");
    const first = await completeSolo(sofia, "pe-anniversary", "stu-ava");
    void first;
    await expect(service.startAct(sofia, "pe-anniversary", "stu-ava")).rejects.toThrow(/1 act/);
  });

  it("never lets one family touch another family's act", async () => {
    const sofia = await as("user-sofia");
    const minh = await as("user-minh");
    const actId = await service.startAct(sofia, "pe-cabaret", "stu-ava");
    await expect(service.saveAct(minh, actId, { title: "Mine now" })).rejects.toThrow(/not yours/);
    expect(await service.getActPage(minh, actId)).toBeNull();
    expect((await service.withdraw(minh, actId)).ok).toBe(false);
    await expect(
      service.attachFile(sofia, actId, "track", { path: `acts/someone-else/track-1.mp3` }, "x.mp3")
    ).rejects.toThrow(/does not belong/);
  });

  it("works out the terms fingerprint and Eastern wall-clock times", () => {
    expect(termsMd5("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(easternToUtc("2026-12-18", "17:00")).toBe("2026-12-18T22:00:00.000Z");
    expect(easternToUtc("2026-07-04", "17:00")).toBe("2026-07-04T21:00:00.000Z");
  });
});
