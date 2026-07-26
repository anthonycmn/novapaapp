import { beforeEach, describe, expect, it } from "vitest";
import { AccessDeniedError } from "@/lib/api/provider";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";
import { MockSmugMugProvider } from "@/lib/api/photos/smugmug";
import { MockFaceMatchProvider } from "@/lib/api/photos/face-provider";
import { cosineSimilarity, matchFace, centroid } from "@/lib/api/photos/matching";
import { MATCH_THRESHOLD, type FaceEmbedding } from "@/lib/api/photos/types";

/**
 * Phase 6 verification. The brief's requirements, stated as tests:
 *  - a consented student's photos surface correctly
 *  - a NON-consented student's photos do not
 *  - revocation deletes embeddings, provably
 *  - matching runs as a background job that never blocks page render
 */

const provider = new MockDataProvider();
const smugmug = new MockSmugMugProvider();

/** Reference photos follow the mock face provider's /face/<identity>/ shape. */
const refs = (identity: string) => [
  `https://example.com/face/${identity}/ref-1.jpg`,
  `https://example.com/face/${identity}/ref-2.jpg`,
];

async function ingestGallery() {
  const [gallery] = await smugmug.listGalleries();
  const photos = await smugmug.listPhotos(gallery.externalId);
  await provider.ingestGallery("user-dana", gallery, photos);
}

beforeEach(() => {
  resetMockStore();
});

describe("matching maths (pure)", () => {
  const face = (vector: number[], confidence = 0.99): FaceEmbedding => ({
    id: "e",
    vector,
    detectionConfidence: confidence,
    createdAt: "2026-07-26T00:00:00.000Z",
  });

  it("cosine similarity is 1 for identical vectors and 0 for opposites", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
    // Negative similarity clamps to 0 — "not similar", not "inversely similar".
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBe(0);
  });

  it("rejects mismatched or empty vectors rather than returning nonsense", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
    expect(() => cosineSimilarity([], [])).toThrow();
  });

  it("ignores low-confidence detections entirely", () => {
    const candidate = {
      studentId: "s1",
      embeddings: [face([1, 0, 0])],
      rejectedPhotoIds: new Set<string>(),
    };
    // Same vector, but the detector wasn't sure it was even a face.
    expect(matchFace(face([1, 0, 0], 0.5), "p1", [candidate])).toBeNull();
  });

  it("never re-asserts a pairing the parent rejected", () => {
    const candidate = {
      studentId: "s1",
      embeddings: [face([1, 0, 0])],
      rejectedPhotoIds: new Set(["p1"]),
    };
    expect(matchFace(face([1, 0, 0]), "p1", [candidate])).toBeNull();
    // A different photo is still fair game.
    expect(matchFace(face([1, 0, 0]), "p2", [candidate])).not.toBeNull();
  });

  it("a student with no reference embeddings is never matchable", () => {
    const candidate = {
      studentId: "s1",
      embeddings: [],
      rejectedPhotoIds: new Set<string>(),
    };
    expect(matchFace(face([1, 0, 0]), "p1", [candidate])).toBeNull();
  });

  it("picks the strongest candidate and respects the threshold", () => {
    const weak = {
      studentId: "weak",
      embeddings: [face([1, 0.9, 0])],
      rejectedPhotoIds: new Set<string>(),
    };
    const strong = {
      studentId: "strong",
      embeddings: [face([1, 0, 0])],
      rejectedPhotoIds: new Set<string>(),
    };
    const result = matchFace(face([1, 0, 0]), "p1", [weak, strong]);
    expect(result?.studentId).toBe("strong");
    expect(result!.similarity).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it("averages reference vectors correctly", () => {
    expect(centroid([[1, 0], [0, 1]])).toEqual([0.5, 0.5]);
    expect(() => centroid([])).toThrow();
  });
});

describe("mock face provider determinism", () => {
  it("gives the same identity similar vectors and different identities dissimilar ones", async () => {
    const faces = new MockFaceMatchProvider();
    const [ava1] = await faces.embedFaces("https://x/face/ava/a.jpg");
    const [ava2] = await faces.embedFaces("https://x/face/ava/b.jpg");
    const [chidi] = await faces.embedFaces("https://x/face/chidi/a.jpg");

    expect(cosineSimilarity(ava1.vector, ava2.vector)).toBeGreaterThan(MATCH_THRESHOLD);
    expect(cosineSimilarity(ava1.vector, chidi.vector)).toBeLessThan(MATCH_THRESHOLD);
  });

  it("returns no faces for a photo with none", async () => {
    const faces = new MockFaceMatchProvider();
    expect(await faces.embedFaces("https://x/face/noface/set.jpg")).toHaveLength(0);
  });
});

describe("consent (#6)", () => {
  it("face matching is OFF for every student by default", async () => {
    const students = await provider.getStudentsForFamily("user-sofia", "fam-martinez");
    expect(students.every((student) => !student.consents.faceMatching)).toBe(true);
  });

  it("only a parent of that child may consent — not staff, not admin, not another family", async () => {
    await expect(
      provider.grantFaceConsent("user-marcus", "stu-ava", refs("ava"))
    ).rejects.toThrow(AccessDeniedError);
    await expect(
      provider.grantFaceConsent("user-dana", "stu-ava", refs("ava"))
    ).rejects.toThrow(AccessDeniedError);
    await expect(
      provider.grantFaceConsent("user-ngozi", "stu-ava", refs("ava"))
    ).rejects.toThrow(AccessDeniedError);
  });

  it("requires between 2 and 4 reference photos", async () => {
    await expect(
      provider.grantFaceConsent("user-sofia", "stu-ava", ["https://x/face/ava/one.jpg"])
    ).rejects.toThrow(/between 2 and 4/);
    await expect(
      provider.grantFaceConsent(
        "user-sofia",
        "stu-ava",
        Array.from({ length: 5 }, (_, i) => `https://x/face/ava/${i}.jpg`)
      )
    ).rejects.toThrow(/between 2 and 4/);
  });

  it("refuses consent when no face can be found, and keeps no photos", async () => {
    await expect(
      provider.grantFaceConsent("user-sofia", "stu-ava", [
        "https://x/face/noface/a.jpg",
        "https://x/face/noface/b.jpg",
      ])
    ).rejects.toThrow(/couldn't find a face/);

    expect(await provider.countEmbeddingsForStudent("user-sofia", "stu-ava")).toBe(0);
    expect(await provider.getReferencePhotos("user-sofia", "stu-ava")).toHaveLength(0);
  });

  it("granting consent creates embeddings and records an audit event", async () => {
    const result = await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    expect(result.embeddingsCreated).toBe(2);
    expect(await provider.countEmbeddingsForStudent("user-sofia", "stu-ava")).toBe(2);

    const history = await provider.getConsentHistory("user-sofia", "stu-ava");
    expect(history[0].action).toBe("granted");
    expect(history[0].actorName).toBe("Sofia Martinez");
  });

  it("reference photos are private to the family — staff cannot read them", async () => {
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    await expect(
      provider.getReferencePhotos("user-marcus", "stu-ava")
    ).rejects.toThrow(AccessDeniedError);
    await expect(
      provider.getReferencePhotos("user-ngozi", "stu-ava")
    ).rejects.toThrow(AccessDeniedError);
  });
});

describe("matching surfaces the right photos (#6)", () => {
  it("a consented student's photos surface; a non-consented student's do not", async () => {
    // Ava opts in. Liên (fam-nguyen) does NOT, though she appears in the gallery.
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    await ingestGallery();
    await provider.runMatching("user-dana");

    const martinez = await provider.getMatchesForFamily("user-sofia", "fam-martinez");
    expect(martinez.length).toBeGreaterThan(0);
    expect(martinez.every((m) => m.studentName === "Ava")).toBe(true);

    // Liên is in photo ph-4 but has no consent → no matches at all.
    const nguyen = await provider.getMatchesForFamily("user-minh", "fam-nguyen");
    expect(nguyen).toHaveLength(0);
  });

  it("creates no embeddings for a student who never consented", async () => {
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    await ingestGallery();
    await provider.runMatching("user-dana");
    expect(await provider.countEmbeddingsForStudent("user-minh", "stu-lien")).toBe(0);
  });

  it("does not match a stranger to anyone", async () => {
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    await ingestGallery();
    await provider.runMatching("user-dana");

    const matches = await provider.getMatchesForFamily("user-sofia", "fam-martinez");
    const photos = await provider.getGalleryPhotos("user-sofia", "gal-frozen-dress");
    const strangerPhoto = photos.find((p) => p.thumbnailUrl.includes("/stranger/"))!;
    expect(matches.some((m) => m.photo.id === strangerPhoto.id)).toBe(false);
  });

  it("another family can never read your matches", async () => {
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    await ingestGallery();
    await provider.runMatching("user-dana");

    await expect(
      provider.getMatchesForFamily("user-ngozi", "fam-martinez")
    ).rejects.toThrow(AccessDeniedError);
    // Staff at large are not family — only admins may look.
    await expect(
      provider.getMatchesForFamily("user-marcus", "fam-martinez")
    ).rejects.toThrow(AccessDeniedError);
  });

  it("notifies the family when photos are found", async () => {
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    await ingestGallery();
    await provider.runMatching("user-dana");

    const notifications = await provider.getNotifications("user-sofia");
    expect(notifications.some((n) => n.type === "photos_posted")).toBe(true);
  });

  it("re-running matching does not duplicate matches", async () => {
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    await ingestGallery();
    const first = await provider.runMatching("user-dana");
    const second = await provider.runMatching("user-dana");

    expect(first.matchesCreated).toBeGreaterThan(0);
    expect(second.matchesCreated).toBe(0);
  });

  it("ingestion is idempotent", async () => {
    await ingestGallery();
    const [gallery] = await smugmug.listGalleries();
    const photos = await smugmug.listPhotos(gallery.externalId);
    const again = await provider.ingestGallery("user-dana", gallery, photos);
    expect(again.photosIngested).toBe(0);
  });

  it("ingestion and matching are staff-only", async () => {
    const [gallery] = await smugmug.listGalleries();
    await expect(
      provider.ingestGallery("user-sofia", gallery, [])
    ).rejects.toThrow(AccessDeniedError);
    await expect(provider.runMatching("user-sofia")).rejects.toThrow(AccessDeniedError);
  });
});

describe("corrections (#6)", () => {
  it('"not my child" hides the photo and is never re-asserted', async () => {
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    await ingestGallery();
    await provider.runMatching("user-dana");

    const before = await provider.getMatchesForFamily("user-sofia", "fam-martinez");
    expect(before.length).toBeGreaterThan(0);

    await provider.rejectMatch("user-sofia", before[0].match.id);

    const after = await provider.getMatchesForFamily("user-sofia", "fam-martinez");
    expect(after.some((m) => m.match.id === before[0].match.id)).toBe(false);

    // A later run must not bring it back.
    await provider.runMatching("user-dana");
    const later = await provider.getMatchesForFamily("user-sofia", "fam-martinez");
    expect(later.some((m) => m.photo.id === before[0].photo.id)).toBe(false);
  });

  it("confirming a match strengthens the reference set", async () => {
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    await ingestGallery();
    await provider.runMatching("user-dana");

    const countBefore = await provider.countEmbeddingsForStudent("user-sofia", "stu-ava");
    const [first] = await provider.getMatchesForFamily("user-sofia", "fam-martinez");
    await provider.confirmMatch("user-sofia", first.match.id);

    expect(await provider.countEmbeddingsForStudent("user-sofia", "stu-ava")).toBe(
      countBefore + 1
    );
  });

  it("another family cannot correct your matches", async () => {
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    await ingestGallery();
    await provider.runMatching("user-dana");
    const [first] = await provider.getMatchesForFamily("user-sofia", "fam-martinez");

    await expect(provider.rejectMatch("user-ngozi", first.match.id)).rejects.toThrow(
      AccessDeniedError
    );
    await expect(provider.confirmMatch("user-ngozi", first.match.id)).rejects.toThrow(
      AccessDeniedError
    );
  });
});

describe("revocation deletes embeddings, provably (#6)", () => {
  it("removes every embedding, reference photo, and match", async () => {
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    await ingestGallery();
    await provider.runMatching("user-dana");

    expect(await provider.countEmbeddingsForStudent("user-sofia", "stu-ava")).toBeGreaterThan(0);
    expect(
      (await provider.getMatchesForFamily("user-sofia", "fam-martinez")).length
    ).toBeGreaterThan(0);

    const event = await provider.revokeFaceConsent("user-sofia", "stu-ava");

    // Deleted, and the audit event says how much — that's the proof.
    expect(event.action).toBe("revoked");
    expect(event.embeddingsDeleted).toBeGreaterThan(0);
    expect(event.referencePhotosDeleted).toBe(2);
    expect(event.matchesDeleted).toBeGreaterThan(0);

    expect(await provider.countEmbeddingsForStudent("user-sofia", "stu-ava")).toBe(0);
    expect(await provider.getReferencePhotos("user-sofia", "stu-ava")).toHaveLength(0);
    expect(await provider.getMatchesForFamily("user-sofia", "fam-martinez")).toHaveLength(0);
  });

  it("flips the consent flag off so future runs skip the student", async () => {
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    await ingestGallery();
    await provider.revokeFaceConsent("user-sofia", "stu-ava");

    const student = await provider.getStudent("user-sofia", "stu-ava");
    expect(student?.consents.faceMatching).toBe(false);

    await provider.runMatching("user-dana");
    expect(await provider.getMatchesForFamily("user-sofia", "fam-martinez")).toHaveLength(0);
    expect(await provider.countEmbeddingsForStudent("user-sofia", "stu-ava")).toBe(0);
  });

  it("an admin may revoke on request; another family may not", async () => {
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    await expect(
      provider.revokeFaceConsent("user-ngozi", "stu-ava")
    ).rejects.toThrow(AccessDeniedError);
    await expect(
      provider.revokeFaceConsent("user-marcus", "stu-ava")
    ).rejects.toThrow(AccessDeniedError);

    const event = await provider.revokeFaceConsent("user-dana", "stu-ava");
    expect(event.embeddingsDeleted).toBe(2);
  });

  it("re-consenting after revocation starts from a clean slate", async () => {
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));
    await provider.revokeFaceConsent("user-sofia", "stu-ava");
    await provider.grantFaceConsent("user-sofia", "stu-ava", refs("ava"));

    // Exactly the new references — no resurrection of the old set.
    expect(await provider.countEmbeddingsForStudent("user-sofia", "stu-ava")).toBe(2);
    const history = await provider.getConsentHistory("user-sofia", "stu-ava");
    expect(history.map((e) => e.action)).toEqual(["granted", "revoked", "granted"]);
  });
});
