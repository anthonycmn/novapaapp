import { createHash } from "node:crypto";

/**
 * Face embedding adapter (#6).
 *
 * CHOSEN APPROACH: self-hosted InsightFace/ArcFace (ONNX) producing 512-d
 * embeddings, stored in Postgres via pgvector. Rationale in DECISIONS.md —
 * the short version is that this is biometric data about children, and
 * keeping it inside infrastructure the org controls means (a) no minor's
 * face is shipped to a third-party identification service, (b) no
 * per-face vendor billing, (c) no vendor approval gate, and (d) when a
 * parent revokes consent we can actually prove the data is gone, because
 * we hold the only copy.
 *
 * A deterministic mock ships by default so the entire flow — consent,
 * ingest, match, correct, revoke — is demo-able and testable with no model
 * present. See NEEDS-FROM-TONY.md #5.
 */

export interface DetectedFaceResult {
  vector: number[];
  detectionConfidence: number;
  /** Where the face sits in the image, for cropping a preview if ever needed. */
  box: { x: number; y: number; width: number; height: number };
}

export interface FaceMatchProvider {
  readonly displayName: string;
  readonly dimensions: number;
  isConfigured(): boolean;
  /** Detect faces in an image and return one embedding per face. */
  embedFaces(imageUrl: string): Promise<DetectedFaceResult[]>;
}

export const EMBEDDING_DIMENSIONS = 512;

/**
 * Deterministic stand-in. Derives a stable pseudo-embedding from any
 * "identity" token found in the URL, so the same person yields similar
 * vectors and different people yield dissimilar ones. This makes matching
 * behaviour reproducible in tests without shipping a model.
 *
 * Convention used by seed data and tests:
 *   .../face/<identity>/<variant>.jpg
 * Anything without that shape gets a vector derived from the whole URL.
 */
export class MockFaceMatchProvider implements FaceMatchProvider {
  readonly displayName = "Mock face matching (no model configured)";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  isConfigured(): boolean {
    return false;
  }

  async embedFaces(imageUrl: string): Promise<DetectedFaceResult[]> {
    const identity = extractIdentity(imageUrl);
    // "noface" lets tests exercise the zero-faces path.
    if (identity === "noface") return [];

    const variant = extractVariant(imageUrl);
    return [
      {
        vector: deterministicVector(identity, variant),
        detectionConfidence: 0.99,
        box: { x: 0.3, y: 0.2, width: 0.25, height: 0.35 },
      },
    ];
  }
}

function extractIdentity(imageUrl: string): string {
  const match = /\/face\/([^/]+)\//.exec(imageUrl);
  return match ? match[1] : imageUrl;
}

function extractVariant(imageUrl: string): string {
  const match = /\/face\/[^/]+\/([^/]+)$/.exec(imageUrl);
  return match ? match[1] : "";
}

/**
 * Stable unit-length vector for an identity, with a small variant-driven
 * perturbation so two photos of the same person are close but not identical.
 */
function deterministicVector(identity: string, variant: string): number[] {
  const base = hashToFloats(identity, EMBEDDING_DIMENSIONS);
  if (!variant) return normalize(base);

  const jitter = hashToFloats(`${identity}:${variant}`, EMBEDDING_DIMENSIONS);
  // 6% jitter keeps same-identity similarity around 0.99 — comfortably
  // above threshold — while different identities stay near 0.
  const perturbed = base.map((value, index) => value + 0.06 * jitter[index]);
  return normalize(perturbed);
}

function hashToFloats(seed: string, count: number): number[] {
  const values: number[] = [];
  let counter = 0;
  while (values.length < count) {
    const digest = createHash("sha256").update(`${seed}:${counter++}`).digest();
    for (let i = 0; i < digest.length && values.length < count; i += 2) {
      // Map two bytes to roughly -1..1.
      const raw = (digest[i] << 8) | digest[i + 1];
      values.push(raw / 32767.5 - 1);
    }
  }
  return values;
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

/**
 * Real adapter: talks to a small self-hosted embedding service wrapping
 * InsightFace. Endpoint contract (documented in NEEDS-FROM-TONY.md #5):
 *   POST { image_url } → { faces: [{ embedding: number[512], confidence, box }] }
 */
export class InsightFaceProvider implements FaceMatchProvider {
  readonly displayName = "InsightFace (self-hosted)";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string
  ) {}

  isConfigured(): boolean {
    return Boolean(this.endpoint && this.apiKey);
  }

  async embedFaces(imageUrl: string): Promise<DetectedFaceResult[]> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image_url: imageUrl }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Face service returned ${response.status}`);
    }

    const body = (await response.json()) as {
      faces?: Array<{
        embedding: number[];
        confidence: number;
        box?: { x: number; y: number; width: number; height: number };
      }>;
    };

    return (body.faces ?? [])
      .filter((face) => Array.isArray(face.embedding) && face.embedding.length === this.dimensions)
      .map((face) => ({
        vector: face.embedding,
        detectionConfidence: face.confidence,
        box: face.box ?? { x: 0, y: 0, width: 0, height: 0 },
      }));
  }
}

let cached: FaceMatchProvider | null = null;

export function getFaceMatchProvider(): FaceMatchProvider {
  if (cached) return cached;
  const endpoint = process.env.FACE_SERVICE_URL;
  const apiKey = process.env.FACE_SERVICE_KEY;
  cached = endpoint && apiKey ? new InsightFaceProvider(endpoint, apiKey) : new MockFaceMatchProvider();
  return cached;
}

export function setFaceMatchProvider(provider: FaceMatchProvider | null): void {
  cached = provider;
}
