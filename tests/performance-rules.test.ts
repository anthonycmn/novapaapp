import { describe, expect, it } from "vitest";
import {
  actEditable,
  actProblem,
  countdown,
  formatFits,
  gradeNumber,
  parseRuntime,
  parseVideoLink,
  signupOpen,
  stepsFor,
  studentEligible,
} from "@/lib/performance/rules";
import type { PerformanceAct, PerformanceEvent } from "@/lib/performance/types";

const NOW = new Date("2026-10-08T16:00:00Z");

function event(over: Partial<PerformanceEvent> = {}): PerformanceEvent {
  return {
    id: "e1",
    title: "Winter Cabaret",
    audience: "all",
    eligibleProductionIds: [],
    eligibleClassIds: [],
    actTypes: ["song", "dance"],
    actFormats: ["solo", "duet"],
    reqVideo: "optional",
    reqHeadshot: "optional",
    reqTrack: "optional",
    reqSheetMusic: "optional",
    reqBio: "optional",
    bioMaxChars: 400,
    selectionMode: "review",
    allowGuests: false,
    feeCents: 0,
    alertRecipients: [],
    status: "published",
    signupClosesAt: "2026-10-20T03:59:00Z",
    rehearsals: [],
    ...over,
  };
}

function act(over: Partial<PerformanceAct> = {}): PerformanceAct {
  return {
    id: "a1",
    eventId: "e1",
    familyId: "f1",
    status: "draft",
    step: 0,
    actType: "song",
    actFormat: "solo",
    title: "Let It Go",
    runtimeSeconds: 200,
    contentOk: true,
    tech: {},
    feeCents: 0,
    feePaid: true,
    performers: [{ id: "p1", kind: "own", studentId: "s1", familyId: "f1", inviteStatus: "confirmed", sort: 0 }],
    rehearsals: [],
    updatedAt: NOW.toISOString(),
    ...over,
  };
}

const ctx = (e: PerformanceEvent, a: PerformanceAct, extra: Partial<Parameters<typeof actProblem>[0]> = {}) => ({
  event: e,
  act: a,
  otherActsByStudent: {},
  eligibleStudentIds: new Set(["s1", "s2"]),
  termsMd5: undefined,
  ...extra,
});

describe("performance rules", () => {
  it("matches performer counts to formats", () => {
    expect(formatFits("solo", 1)).toBe(true);
    expect(formatFits("duet", 1)).toBe(false);
    expect(formatFits("small_group", 4)).toBe(true);
    expect(formatFits("small_group", 9)).toBe(false);
    expect(formatFits("large_group", 9)).toBe(true);
  });

  it("reads running times the way parents type them", () => {
    expect(parseRuntime("3:30")).toBe(210);
    expect(parseRuntime("3m 30s")).toBe(210);
    expect(parseRuntime("4")).toBe(240);
    expect(parseRuntime("90s")).toBe(90);
    expect(parseRuntime("three minutes")).toBeUndefined();
  });

  it("takes video links and embeds the four hosts families use", () => {
    expect(parseVideoLink("https://youtu.be/abc123")).toMatchObject({ ok: true, host: "youtube", embedUrl: "https://www.youtube-nocookie.com/embed/abc123" });
    expect(parseVideoLink("youtube.com/watch?v=xyz")).toMatchObject({ ok: true, embedUrl: "https://www.youtube-nocookie.com/embed/xyz" });
    expect(parseVideoLink("https://vimeo.com/123456789")).toMatchObject({ host: "vimeo", embedUrl: "https://player.vimeo.com/video/123456789" });
    expect(parseVideoLink("https://drive.google.com/file/d/FILE/view")).toMatchObject({ host: "drive", embedUrl: "https://drive.google.com/file/d/FILE/preview" });
    expect(parseVideoLink("https://www.dropbox.com/s/x/clip.mp4?dl=0")).toMatchObject({ host: "dropbox" });
    expect(parseVideoLink("not a link").ok).toBe(false);
    expect(parseVideoLink("").ok).toBe(false);
  });

  it("reads grades as families write them", () => {
    expect(gradeNumber("5th")).toBe(5);
    expect(gradeNumber("8th grade")).toBe(8);
    expect(gradeNumber("K")).toBe(0);
    expect(gradeNumber("Pre-K")).toBe(-1);
    expect(gradeNumber("")).toBeUndefined();
  });

  it("limits a chosen-audience event to its shows and classes, and lets unknown ages through", () => {
    const e = event({ audience: "chosen", eligibleProductionIds: ["frozen"], minAge: 8, maxAge: 14, startsAt: "2026-12-18T23:00:00Z" });
    expect(studentEligible(e, { dateOfBirth: "2015-03-12", productionIds: ["frozen"], classIds: [] })).toBe(true);
    expect(studentEligible(e, { dateOfBirth: "2015-03-12", productionIds: ["mermaid"], classIds: [] })).toBe(false);
    expect(studentEligible(e, { dateOfBirth: "2019-01-01", productionIds: ["frozen"], classIds: [] })).toBe(false);
    expect(studentEligible(e, { productionIds: ["frozen"], classIds: [] })).toBe(true);
  });

  it("opens and closes on the deadline, and a change request reopens one act", () => {
    const e = event();
    expect(signupOpen(e, NOW)).toBe(true);
    const after = new Date("2026-10-21T00:00:00Z");
    expect(signupOpen(e, after)).toBe(false);
    expect(actEditable(e, { status: "submitted" }, after)).toBe(false);
    expect(actEditable(e, { status: "needs_changes" }, after)).toBe(true);
    expect(actEditable(e, { status: "withdrawn" }, NOW)).toBe(false);
    expect(signupOpen(event({ status: "draft" }), NOW)).toBe(false);
  });

  it("passes a complete solo and names the first problem otherwise", () => {
    const e = event();
    expect(actProblem(ctx(e, act()))).toBeNull();
    expect(actProblem(ctx(e, act({ title: "" })))).toBe("Give the act a title.");
    expect(actProblem(ctx(e, act({ actType: "acting" })))).toBe("Choose one of the act types this event allows.");
    expect(actProblem(ctx(e, act({ contentOk: false })))).toBe("Confirm the material is family-appropriate.");
    expect(actProblem(ctx(e, act({ actFormat: "duet" })))).toBe("The number of performers does not match the act format.");
  });

  it("holds the running-time limit", () => {
    expect(actProblem(ctx(event({ maxMinutesPerAct: 3 }), act({ runtimeSeconds: 200 })))).toBe("Acts can run 3 minutes at most.");
    expect(actProblem(ctx(event({ maxMinutesPerAct: 3.5 }), act({ runtimeSeconds: 200 })))).toBeNull();
  });

  it("requires a video only when the event says so", () => {
    expect(actProblem(ctx(event({ reqVideo: "required" }), act()))).toBe("Add a performance video link.");
    expect(actProblem(ctx(event({ reqVideo: "required" }), act({ videoUrl: "https://youtu.be/x" })))).toBeNull();
    expect(actProblem(ctx(event({ reqVideo: "off" }), act()))).toBeNull();
  });

  it("caps acts per student", () => {
    const e = event({ maxActsPerStudent: 1 });
    expect(actProblem(ctx(e, act(), { otherActsByStudent: { s1: 1 } }))).toMatch(/A student can be in 1 act in this event/);
    expect(actProblem(ctx(e, act(), { otherActsByStudent: { s1: 0 } }))).toBeNull();
  });

  it("counts a pending invite toward the format, but not a declined one", () => {
    const two = act({
      actFormat: "duet",
      performers: [
        { id: "p1", kind: "own", studentId: "s1", familyId: "f1", inviteStatus: "confirmed", sort: 0 },
        { id: "p2", kind: "invited", inviteEmail: "x@example.com", inviteStatus: "pending", sort: 1 },
      ],
    });
    expect(actProblem(ctx(event(), two))).toBeNull();
    two.performers[1].inviteStatus = "declined";
    expect(actProblem(ctx(event(), two))).toBe("The number of performers does not match the act format.");
  });

  it("refuses guests unless the event takes them", () => {
    const withGuest = act({
      actFormat: "duet",
      performers: [
        { id: "p1", kind: "own", studentId: "s1", familyId: "f1", inviteStatus: "confirmed", sort: 0 },
        { id: "p2", kind: "guest", guestName: "Sam", inviteStatus: "confirmed", sort: 1 },
      ],
    });
    expect(actProblem(ctx(event(), withGuest))).toBe("This event does not take guest performers.");
    expect(actProblem(ctx(event({ allowGuests: true }), withGuest))).toBeNull();
  });

  it("wants every required rehearsal answered, with a reason for a conflict", () => {
    const e = event({ rehearsals: [{ id: "r1", onDate: "2026-12-10", required: true }, { id: "r2", onDate: "2026-12-11", required: false }] });
    expect(actProblem(ctx(e, act()))).toBe("Answer every required rehearsal, and explain any conflict.");
    expect(actProblem(ctx(e, act({ rehearsals: [{ rehearsalId: "r1", available: false }] })))).toBe("Answer every required rehearsal, and explain any conflict.");
    expect(actProblem(ctx(e, act({ rehearsals: [{ rehearsalId: "r1", available: false, conflictNote: "Away that weekend" }] })))).toBeNull();
  });

  it("wants the current terms accepted, not an older version", () => {
    const e = event({ termsBody: "## Terms\n- Be kind" });
    expect(actProblem(ctx(e, act(), { termsMd5: "new" }))).toBe("Read and accept the terms.");
    expect(actProblem(ctx(e, act({ termsAcceptedAt: NOW.toISOString(), termsMd5: "old" }), { termsMd5: "new" }))).toBe("Read and accept the terms.");
    expect(actProblem(ctx(e, act({ termsAcceptedAt: NOW.toISOString(), termsMd5: "new" }), { termsMd5: "new" }))).toBeNull();
  });

  it("enforces required headshots and bios for the family's own performers only", () => {
    const e = event({ reqHeadshot: "required", reqBio: "required", actFormats: ["duet"] });
    const a = act({
      actFormat: "duet",
      performers: [
        { id: "p1", kind: "own", studentId: "s1", familyId: "f1", inviteStatus: "confirmed", sort: 0, headshotPath: "x", bio: "Ava loves to sing." },
        { id: "p2", kind: "invited", inviteEmail: "x@example.com", inviteStatus: "pending", sort: 1 },
      ],
    });
    expect(actProblem(ctx(e, a))).toBeNull();
    a.performers[0].headshotPath = undefined;
    expect(actProblem(ctx(e, a))).toBe("Add a headshot for every performer.");
  });

  it("skips wizard steps the event has no use for", () => {
    expect(stepsFor(event({ actFormats: ["solo"] }))).not.toContain("performers");
    expect(stepsFor(event())).toContain("performers");
    expect(stepsFor(event())).not.toContain("rehearsals");
    expect(stepsFor(event({ rehearsals: [{ id: "r", onDate: "2026-12-01", required: true }] }))).toContain("rehearsals");
    expect(stepsFor(event({ reqBio: "off" }))).toContain("program");
  });

  it("counts down in days, then hours", () => {
    expect(countdown("2026-10-11T20:00:00Z", NOW)).toBe("3 days, 4 hours left");
    expect(countdown("2026-10-08T18:30:00Z", NOW)).toBe("2 hours, 30 minutes left");
    expect(countdown("2026-10-08T15:00:00Z", NOW)).toBeNull();
  });
});
