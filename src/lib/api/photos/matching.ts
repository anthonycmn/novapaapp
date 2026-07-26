import {
  MATCH_FLOOR,
  MATCH_THRESHOLD,
  MIN_DETECTION_CONFIDENCE,
  type FaceEmbedding,
} from "./types";

/**
 * Pure matching maths (#6). No I/O, so the thresholds and the
 * "never match a non-consented student" rule are directly unit-testable.
 */

/** Cosine similarity of two equal-length vectors, clamped to 0..1. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error("Embeddings must be non-empty and the same length");
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  // Cosine ranges -1..1; negatives mean "not similar at all" here.
  return Math.max(0, Math.min(1, similarity));
}

export interface CandidateStudent {
  studentId: string;
  /** Reference embeddings for this student. Empty = never matchable. */
  embeddings: FaceEmbedding[];
  /**
   * Photo ids a parent has explicitly said are NOT their child. We never
   * re-assert a rejected pairing, even if the maths says otherwise.
   */
  rejectedPhotoIds: Set<string>;
}

export interface MatchCandidate {
  studentId: string;
  photoId: string;
  similarity: number;
}

/**
 * Compare one detected face against every consented student.
 *
 * Callers are responsible for passing ONLY students with active consent —
 * `matchFace` has no way to know about consent and will match whatever it
 * is given. The data layer enforces that invariant and tests pin it.
 */
export function matchFace(
  face: FaceEmbedding,
  photoId: string,
  candidates: CandidateStudent[]
): MatchCandidate | null {
  if (face.detectionConfidence < MIN_DETECTION_CONFIDENCE) return null;

  let best: MatchCandidate | null = null;

  for (const candidate of candidates) {
    if (candidate.rejectedPhotoIds.has(photoId)) continue;
    if (candidate.embeddings.length === 0) continue;

    // Best similarity across the student's reference photos: different
    // angles and lighting, so the strongest single match is the signal.
    let bestForStudent = 0;
    for (const reference of candidate.embeddings) {
      const similarity = cosineSimilarity(face.vector, reference.vector);
      if (similarity > bestForStudent) bestForStudent = similarity;
    }

    if (bestForStudent < MATCH_FLOOR) continue;
    if (!best || bestForStudent > best.similarity) {
      best = { studentId: candidate.studentId, photoId, similarity: bestForStudent };
    }
  }

  if (!best || best.similarity < MATCH_THRESHOLD) return null;
  return best;
}

/** Average of a student's reference vectors — used after a correction. */
export function centroid(vectors: number[][]): number[] {
  if (vectors.length === 0) throw new Error("No vectors to average");
  const length = vectors[0].length;
  const sum = new Array<number>(length).fill(0);
  for (const vector of vectors) {
    if (vector.length !== length) throw new Error("Mismatched vector lengths");
    for (let i = 0; i < length; i++) sum[i] += vector[i];
  }
  return sum.map((value) => value / vectors.length);
}
