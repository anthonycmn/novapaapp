/**
 * Photo matching domain types (#6).
 *
 * Vocabulary, kept deliberately precise because this is biometric data
 * about children:
 *   ReferencePhoto — a photo a parent uploaded so we can learn a face
 *   FaceEmbedding  — a numeric vector derived from a face; NOT an image
 *   DetectedFace   — a face found in a gallery photo, with its embedding
 *   PhotoMatch     — our claim that a DetectedFace is a given student
 */

export interface Gallery {
  id: string;
  /** SmugMug album key, for deep linking back. */
  externalId: string;
  title: string;
  productionId?: string;
  photoCount: number;
  /** SmugMug gallery URL — purchases still flow through SmugMug. */
  url: string;
  createdAt: string;
  ingestedAt?: string;
}

export interface GalleryPhoto {
  id: string;
  galleryId: string;
  externalId: string;
  /** Display-size image URL (SmugMug CDN). */
  thumbnailUrl: string;
  /** Deep link to this photo inside the SmugMug gallery. */
  url: string;
  takenAt?: string;
  width: number;
  height: number;
}

export interface ReferencePhoto {
  id: string;
  studentId: string;
  /** Stored only while consent is active. */
  imageUrl: string;
  uploadedAt: string;
}

/**
 * A face vector. `vector` is the only biometric artifact we keep — we never
 * retain a cropped face image from a gallery photo.
 */
export interface FaceEmbedding {
  id: string;
  /** Set when this embedding came from a parent-uploaded reference photo. */
  studentId?: string;
  /** Set when this embedding came from a gallery photo. */
  photoId?: string;
  vector: number[];
  /** Detector confidence that this region is a face at all. */
  detectionConfidence: number;
  createdAt: string;
}

export type MatchState = "matched" | "rejected" | "confirmed";

export interface PhotoMatch {
  id: string;
  studentId: string;
  photoId: string;
  /** Cosine similarity at the time of matching, 0..1. */
  similarity: number;
  state: MatchState;
  createdAt: string;
  /** Set when a parent corrected us. */
  correctedAt?: string;
}

/** Audit trail for consent changes — required for a biometric feature. */
export interface ConsentEvent {
  id: string;
  studentId: string;
  action: "granted" | "revoked";
  /** Who acted, for the audit trail. */
  actorName: string;
  createdAt: string;
  /** Recorded on revocation so deletion can be proven to have happened. */
  embeddingsDeleted?: number;
  matchesDeleted?: number;
  referencePhotosDeleted?: number;
}

/**
 * Similarity at or above this is treated as the same person.
 * Deliberately conservative: a false positive shows one family another
 * family's child, which is far worse than missing a photo. Tuned for
 * ArcFace-style 512-d embeddings.
 */
export const MATCH_THRESHOLD = 0.62;

/** Below this we don't even consider it; between the two we ignore for now. */
export const MATCH_FLOOR = 0.45;

/** A face region must be at least this confident to be used at all. */
export const MIN_DETECTION_CONFIDENCE = 0.9;

/** Parents upload between these many reference photos. */
export const MIN_REFERENCE_PHOTOS = 2;
export const MAX_REFERENCE_PHOTOS = 4;

/** Consent revocation must delete embeddings within this window (#6). */
export const REVOCATION_DELETION_HOURS = 24;
