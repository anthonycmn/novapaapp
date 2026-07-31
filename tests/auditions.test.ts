import { beforeEach, describe, expect, it } from "vitest";
import { AccessDeniedError } from "@/lib/api/provider";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";

/**
 * Audition & casting pipeline. The rules that matter most:
 *  - a preference never guarantees a part, and submission requires
 *    acknowledging that
 *  - every registered student must be cast before submit ("no student
 *    forgotten")
 *  - a family is told THEIR child's role only — never a cast list
 *  - rubric feedback releases only on request, only for their own child,
 *    and callback notes never leave the staff side
 */

const provider = new MockDataProvider();

const goodScores = {
  acting: { characterization: 4, projection: 3, emotional_range: 4, direction: 5 },
  vocal: { pitch: 3, tone: 3, range: 2, musicality: 3 },
  dance: { technique: 5, rhythm: 5, pickup: 4, performance: 5 },
};

/** Registered for Frozen in seed: Ava, Leo (Martinez), Chidi (Okafor), Liên (Nguyen). */
async function castEveryone() {
  await provider.assignRole("user-dana", "prod-frozen", "role-elsa", "stu-ava");
  await provider.assignRole("user-dana", "prod-frozen", "role-anna", "stu-lien");
  await provider.assignRole("user-dana", "prod-frozen", "role-kristoff", "stu-chidi");
  await provider.assignRole("user-dana", "prod-frozen", "role-snow-chorus", "stu-leo");
}

beforeEach(() => {
  resetMockStore();
});

describe("audition profile", () => {
  it("requires the no-guarantee acknowledgment", async () => {
    await expect(
      provider.submitAuditionProfile("user-sofia", {
        studentId: "stu-ava",
        productionId: "prod-frozen",
        preferenceTier: "lead",
        previousRoles: "Young Anna (2025)",
        hopes: "Confidence and new friends",
        acknowledgedNoGuarantee: false,
      })
    ).rejects.toThrow(/doesn't guarantee/);
  });

  it("a parent submits for their child; the acknowledgment is timestamped", async () => {
    const profile = await provider.submitAuditionProfile("user-sofia", {
      studentId: "stu-ava",
      productionId: "prod-frozen",
      preferenceTier: "lead",
      previousRoles: "Young Anna (2025)",
      hopes: "Confidence and new friends",
      acknowledgedNoGuarantee: true,
    });
    expect(profile.acknowledgedNoGuaranteeAt).toBeTruthy();
    expect(profile.submittedByRole).toBe("parent");
  });

  it("a 13+ student with a login submits for themselves", async () => {
    const profile = await provider.submitAuditionProfile("user-chidi", {
      studentId: "stu-chidi",
      productionId: "prod-frozen",
      preferenceTier: "supporting",
      previousRoles: "Sebastian (2024)",
      hopes: "A named part with a solo",
      acknowledgedNoGuarantee: true,
    });
    expect(profile.submittedByRole).toBe("student");
  });

  it("another family cannot submit for your child, and staff cannot either", async () => {
    const input = {
      studentId: "stu-ava",
      productionId: "prod-frozen",
      preferenceTier: "lead" as const,
      previousRoles: "",
      hopes: "",
      acknowledgedNoGuarantee: true,
    };
    await expect(provider.submitAuditionProfile("user-ngozi", input)).rejects.toThrow(
      AccessDeniedError
    );
    await expect(provider.submitAuditionProfile("user-dana", input)).rejects.toThrow(
      AccessDeniedError
    );
  });

  it("rejects a student not registered for the production", async () => {
    // Amara is class-only in the seed, not in Frozen.
    await expect(
      provider.submitAuditionProfile("user-ngozi", {
        studentId: "stu-amara",
        productionId: "prod-frozen",
        preferenceTier: "ensemble",
        previousRoles: "",
        hopes: "",
        acknowledgedNoGuarantee: true,
      })
    ).rejects.toThrow(/isn't registered/);
  });

  it("resubmitting updates rather than duplicates", async () => {
    const input = {
      studentId: "stu-ava",
      productionId: "prod-frozen",
      preferenceTier: "lead" as const,
      previousRoles: "",
      hopes: "First hopes",
      acknowledgedNoGuarantee: true,
    };
    await provider.submitAuditionProfile("user-sofia", input);
    await provider.submitAuditionProfile("user-sofia", { ...input, hopes: "Updated hopes" });
    const profile = await provider.getAuditionProfile("user-sofia", "stu-ava", "prod-frozen");
    expect(profile?.hopes).toBe("Updated hopes");
  });
});

describe("rubric evaluations", () => {
  it("staff-only, validated 1–5 across the discipline's criteria", async () => {
    await expect(
      provider.submitEvaluation("user-sofia", {
        studentId: "stu-ava",
        productionId: "prod-frozen",
        discipline: "acting",
        scores: goodScores.acting,
        notes: "",
        callbackNotes: "",
      })
    ).rejects.toThrow(AccessDeniedError);

    await expect(
      provider.submitEvaluation("user-dana", {
        studentId: "stu-ava",
        productionId: "prod-frozen",
        discipline: "acting",
        scores: { characterization: 6, projection: 3, emotional_range: 4, direction: 5 },
        notes: "",
        callbackNotes: "",
      })
    ).rejects.toThrow(/1–5/);
  });

  it("one evaluation per discipline per student — re-scoring updates", async () => {
    await provider.submitEvaluation("user-dana", {
      studentId: "stu-ava",
      productionId: "prod-frozen",
      discipline: "acting",
      scores: goodScores.acting,
      notes: "Strong instincts",
      callbackNotes: "Consider for Elsa, Young Elsa",
    });
    await provider.submitEvaluation("user-dana", {
      studentId: "stu-ava",
      productionId: "prod-frozen",
      discipline: "acting",
      scores: goodScores.acting,
      notes: "Revised note",
      callbackNotes: "Elsa only",
    });
    const roster = await provider.getAuditionRoster("user-dana", "prod-frozen");
    const ava = roster.find((row) => row.student.id === "stu-ava")!;
    expect(ava.evaluations).toHaveLength(1);
    expect(ava.evaluations[0].notes).toBe("Revised note");
  });

  it("the roster covers every registered student — no one forgotten", async () => {
    const roster = await provider.getAuditionRoster("user-dana", "prod-frozen");
    expect(roster.map((row) => row.student.id).sort()).toEqual(
      ["stu-ava", "stu-chidi", "stu-leo", "stu-lien"].sort()
    );
  });
});

describe("casting board", () => {
  it("a named role holds one student; reassigning replaces, not double-casts", async () => {
    await provider.assignRole("user-dana", "prod-frozen", "role-elsa", "stu-ava");
    await provider.assignRole("user-dana", "prod-frozen", "role-elsa", "stu-lien");
    const { board, unassigned } = await provider.getCastingBoard("user-dana", "prod-frozen");
    const elsaEntries = board.entries.filter((entry) => entry.roleId === "role-elsa");
    expect(elsaEntries).toHaveLength(1);
    expect(elsaEntries[0].studentId).toBe("stu-lien");
    // Ava went back to unassigned rather than vanishing.
    expect(unassigned.some((s) => s.id === "stu-ava")).toBe(true);
  });

  it("an ensemble group holds many students", async () => {
    await provider.assignRole("user-dana", "prod-frozen", "role-snow-chorus", "stu-ava");
    await provider.assignRole("user-dana", "prod-frozen", "role-snow-chorus", "stu-leo");
    const { board } = await provider.getCastingBoard("user-dana", "prod-frozen");
    expect(board.entries.filter((e) => e.roleId === "role-snow-chorus")).toHaveLength(2);
  });

  it("a student holds exactly one role — placing them again moves them", async () => {
    await provider.assignRole("user-dana", "prod-frozen", "role-elsa", "stu-ava");
    await provider.assignRole("user-dana", "prod-frozen", "role-anna", "stu-ava");
    const { board } = await provider.getCastingBoard("user-dana", "prod-frozen");
    const avaEntries = board.entries.filter((entry) => entry.studentId === "stu-ava");
    expect(avaEntries).toHaveLength(1);
    expect(avaEntries[0].roleId).toBe("role-anna");
  });

  it("cannot submit until EVERY registered student has a role", async () => {
    await provider.assignRole("user-dana", "prod-frozen", "role-elsa", "stu-ava");
    await expect(provider.submitCasting("user-dana", "prod-frozen")).rejects.toThrow(
      /unassigned/i
    );
  });

  it("submit publishes assignments and locks the board", async () => {
    await castEveryone();
    const result = await provider.submitCasting("user-dana", "prod-frozen");
    expect(result.assignmentsCreated).toBe(4);
    expect(result.familiesNotified).toBe(3); // Martinez has two kids

    await expect(
      provider.assignRole("user-dana", "prod-frozen", "role-elsa", "stu-leo")
    ).rejects.toThrow(/already been submitted/);
    await expect(provider.submitCasting("user-dana", "prod-frozen")).rejects.toThrow(
      /already been submitted/
    );
  });
});

describe("family notification & confirmation — no cast list ever", () => {
  it("each family is told their child's role only", async () => {
    await castEveryone();
    await provider.submitCasting("user-dana", "prod-frozen");

    const nguyen = await provider.getNotifications("user-minh");
    const castingNote = nguyen.find((n) => n.type === "casting_released")!;
    expect(castingNote.body).toContain("Anna");
    // Nobody else's role or name appears.
    expect(castingNote.body).not.toMatch(/Elsa|Kristoff|Snow Chorus|Ava|Chidi|Leo/);

    // The Martinez family (two kids) gets one notification per child,
    // each mentioning only that child.
    const martinez = await provider.getNotifications("user-sofia");
    const castingNotes = martinez.filter((n) => n.type === "casting_released");
    expect(castingNotes).toHaveLength(2);
  });

  it("a family sees only their own confirmations", async () => {
    await castEveryone();
    await provider.submitCasting("user-dana", "prod-frozen");

    const nguyen = await provider.getMyCastingConfirmations("user-minh");
    expect(nguyen).toHaveLength(1);
    expect(nguyen[0].roleName).toBe("Anna");

    const martinez = await provider.getMyCastingConfirmations("user-sofia");
    expect(martinez).toHaveLength(2);
    expect(martinez.every((c) => ["stu-ava", "stu-leo"].includes(c.confirmation.studentId))).toBe(
      true
    );
  });

  it("confirming yes records it; confirming no requires the playbill name", async () => {
    await castEveryone();
    await provider.submitCasting("user-dana", "prod-frozen");
    const [mine] = await provider.getMyCastingConfirmations("user-minh");

    await expect(
      provider.respondToCasting("user-minh", mine.confirmation.id, { nameCorrect: false })
    ).rejects.toThrow(/playbill/);

    const corrected = await provider.respondToCasting("user-minh", mine.confirmation.id, {
      nameCorrect: false,
      playbillName: "Lily Nguyễn",
    });
    expect(corrected.playbillName).toBe("Lily Nguyễn");

    // Staff can see the correction for the playbill.
    const responses = await provider.getCastingResponses("user-dana", "prod-frozen");
    expect(
      responses.some((row) => row.confirmation.playbillName === "Lily Nguyễn")
    ).toBe(true);
  });

  it("ORG POLICY: the parent's correction is final — no approval step, and they can revise it", async () => {
    await castEveryone();
    await provider.submitCasting("user-dana", "prod-frozen");
    const [mine] = await provider.getMyCastingConfirmations("user-minh");

    // First correction takes effect immediately with no pending/approval state.
    await provider.respondToCasting("user-minh", mine.confirmation.id, {
      nameCorrect: false,
      playbillName: "Lily Ngyuen", // typo'd on purpose
    });
    let responses = await provider.getCastingResponses("user-dana", "prod-frozen");
    expect(responses.some((r) => r.confirmation.playbillName === "Lily Ngyuen")).toBe(true);

    // Because it's final, the family must be able to fix their own typo.
    await provider.respondToCasting("user-minh", mine.confirmation.id, {
      nameCorrect: false,
      playbillName: "Lily Nguyễn",
    });
    responses = await provider.getCastingResponses("user-dana", "prod-frozen");
    expect(responses.some((r) => r.confirmation.playbillName === "Lily Nguyễn")).toBe(true);
    expect(responses.some((r) => r.confirmation.playbillName === "Lily Ngyuen")).toBe(false);

    // And flipping back to "yes" clears the correction entirely.
    await provider.respondToCasting("user-minh", mine.confirmation.id, {
      nameCorrect: true,
    });
    responses = await provider.getCastingResponses("user-dana", "prod-frozen");
    const row = responses.find((r) => r.confirmation.id === mine.confirmation.id)!;
    expect(row.confirmation.playbillName).toBeUndefined();
    expect(row.confirmation.nameCorrect).toBe(true);
  });

  it("ORG POLICY: no two students ever share a named role, at any capacity", async () => {
    const roles = await provider.getShowRoles("prod-frozen");
    // Every non-ensemble role has capacity exactly 1.
    for (const role of roles.filter((r) => r.tier !== "ensemble")) {
      expect(role.capacity).toBe(1);
    }
    // Ensemble groups are unlimited — multiple students is fine.
    for (const role of roles.filter((r) => r.tier === "ensemble")) {
      expect(role.capacity).toBeNull();
    }
  });

  it("another family cannot respond to your confirmation", async () => {
    await castEveryone();
    await provider.submitCasting("user-dana", "prod-frozen");
    const [mine] = await provider.getMyCastingConfirmations("user-minh");
    await expect(
      provider.respondToCasting("user-sofia", mine.confirmation.id, { nameCorrect: true })
    ).rejects.toThrow(AccessDeniedError);
  });
});

describe("12-hour confirmation reminders", () => {
  it("re-notifies only unanswered confirmations, and answering stops them", async () => {
    await castEveryone();
    await provider.submitCasting("user-dana", "prod-frozen");

    // Nothing is due yet at the real 12h window.
    expect(
      (await provider.remindPendingCastingConfirmations("user-dana")).reminded
    ).toBe(0);

    // Force-eligible via the test override: all 4 unanswered → all reminded.
    const first = await provider.remindPendingCastingConfirmations("user-dana", {
      olderThanMs: -1,
    });
    expect(first.reminded).toBe(4);

    const sofia = await provider.getNotifications("user-sofia");
    expect(
      sofia.filter((n) => n.title.includes("Reminder: confirm")).length
    ).toBe(2); // one per Martinez child

    // Minh answers; the next forced run skips that confirmation.
    const [minhs] = await provider.getMyCastingConfirmations("user-minh");
    await provider.respondToCasting("user-minh", minhs.confirmation.id, {
      nameCorrect: true,
    });
    const second = await provider.remindPendingCastingConfirmations("user-dana", {
      olderThanMs: -1,
    });
    expect(second.reminded).toBe(3);
  });

  it("is staff-only", async () => {
    await expect(
      provider.remindPendingCastingConfirmations("user-sofia")
    ).rejects.toThrow(AccessDeniedError);
  });
});

describe("feedback release & recommendations", () => {
  async function fullPipeline() {
    for (const discipline of ["acting", "vocal", "dance"] as const) {
      await provider.submitEvaluation("user-dana", {
        studentId: "stu-ava",
        productionId: "prod-frozen",
        discipline,
        scores: goodScores[discipline],
        notes: `${discipline} notes for the family`,
        callbackNotes: "STAFF ONLY: consider for Elsa",
      });
    }
    await castEveryone();
    await provider.submitCasting("user-dana", "prod-frozen");
    const confirmations = await provider.getMyCastingConfirmations("user-sofia");
    return confirmations.find((c) => c.confirmation.studentId === "stu-ava")!;
  }

  it("releases the rubric and notes — but NEVER the callback notes", async () => {
    const mine = await fullPipeline();
    const released = await provider.requestAuditionFeedback(
      "user-sofia",
      mine.confirmation.id
    );
    expect(released).toHaveLength(3);
    expect(released.every((evaluation) => evaluation.callbackNotes === "")).toBe(true);
    expect(released.some((evaluation) => evaluation.notes.includes("notes for the family"))).toBe(
      true
    );
    expect(JSON.stringify(released)).not.toContain("STAFF ONLY");
  });

  it("another family cannot request your child's feedback", async () => {
    const mine = await fullPipeline();
    await expect(
      provider.requestAuditionFeedback("user-ngozi", mine.confirmation.id)
    ).rejects.toThrow(AccessDeniedError);
  });

  it("recommends lessons only for disciplines below the threshold", async () => {
    await fullPipeline();
    const recommendations = await provider.getGrowthRecommendations(
      "user-sofia",
      "stu-ava",
      "prod-frozen"
    );
    // vocal averaged 2.75 (below 4) → recommended; dance 4.75 → not;
    // acting 4.0 → not (threshold is strictly below).
    expect(recommendations.map((r) => r.discipline)).toEqual(["vocal"]);
    expect(recommendations[0].productIds).toContain("prod-voice-lessons");
    expect(recommendations[0].classIds).toContain("class-voice1");
  });

  it("recommendations are private to the family and staff", async () => {
    await fullPipeline();
    await expect(
      provider.getGrowthRecommendations("user-ngozi", "stu-ava", "prod-frozen")
    ).rejects.toThrow(AccessDeniedError);
  });
});
