/**
 * File storage (headshots, resumes, audio, family documents).
 *
 * Everything that uploads a file goes through this interface. The mock keeps
 * data URLs in memory so the whole app is demo-able with no bucket; the
 * Supabase adapter writes to private Storage buckets and hands back signed
 * URLs. Swapping is a config change, not a code change.
 */

export type StorageBucket =
  | "headshots"
  | "resumes"
  | "audition-audio"
  | "family-documents"
  | "staff-photos"
  | "button-photos"
  | "reference-photos"
  | "curriculum";

export interface StoredFile {
  url: string;
  path: string;
  bucket: StorageBucket;
  sizeBytes: number;
  contentType: string;
}

export interface StorageProvider {
  readonly displayName: string;
  isConfigured(): boolean;
  /** `dataUrl` is a `data:<type>;base64,...` string from the client. */
  upload(bucket: StorageBucket, path: string, dataUrl: string): Promise<StoredFile>;
  remove(bucket: StorageBucket, path: string): Promise<void>;
}

/** Parse a data URL into its content type and raw bytes. */
export function parseDataUrl(dataUrl: string): { contentType: string; bytes: Buffer } {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error("Expected a base64 data URL");
  return { contentType: match[1], bytes: Buffer.from(match[2], "base64") };
}

class MockStorageProvider implements StorageProvider {
  readonly displayName = "In-memory storage (no bucket configured)";
  private files = new Map<string, StoredFile>();

  isConfigured(): boolean {
    return false;
  }

  async upload(bucket: StorageBucket, path: string, dataUrl: string): Promise<StoredFile> {
    const { contentType, bytes } = parseDataUrl(dataUrl);
    const stored: StoredFile = {
      // The data URL *is* the URL in mock mode, so <img src> just works.
      url: dataUrl,
      path,
      bucket,
      sizeBytes: bytes.length,
      contentType,
    };
    this.files.set(`${bucket}/${path}`, stored);
    return stored;
  }

  async remove(bucket: StorageBucket, path: string): Promise<void> {
    this.files.delete(`${bucket}/${path}`);
  }
}

class SupabaseStorageProvider implements StorageProvider {
  readonly displayName = "Supabase Storage";

  constructor(
    private readonly url: string,
    private readonly serviceKey: string
  ) {}

  isConfigured(): boolean {
    return Boolean(this.url && this.serviceKey);
  }

  /**
   * Physical bucket name. The storage bucket namespace is shared across the
   * whole novapa project and the portal already owns a `resumes` bucket, so
   * the family hub's buckets carry an `fh-` prefix. Override with
   * SUPABASE_BUCKET_PREFIX (empty string = unprefixed, for novapa-deh).
   */
  private physical(bucket: StorageBucket): string {
    return `${process.env.SUPABASE_BUCKET_PREFIX ?? "fh-"}${bucket}`;
  }

  async upload(bucket: StorageBucket, path: string, dataUrl: string): Promise<StoredFile> {
    const { contentType, bytes } = parseDataUrl(dataUrl);

    const response = await fetch(
      `${this.url}/storage/v1/object/${this.physical(bucket)}/${encodeURIComponent(path)}`,
      {
        method: "POST",
        headers: {
          // Both headers: legacy JWT keys use Authorization, new sb_secret_
          // keys ride the apikey header. Sending both covers either project.
          Authorization: `Bearer ${this.serviceKey}`,
          apikey: this.serviceKey,
          "Content-Type": contentType,
          "x-upsert": "true",
        },
        body: new Uint8Array(bytes),
      }
    );

    if (!response.ok) {
      throw new Error(`Storage upload failed (${response.status}): ${await response.text()}`);
    }

    // Buckets are private; the app serves files through signed URLs.
    return {
      url: `${this.url}/storage/v1/object/${this.physical(bucket)}/${path}`,
      path,
      bucket,
      sizeBytes: bytes.length,
      contentType,
    };
  }

  async remove(bucket: StorageBucket, path: string): Promise<void> {
    await fetch(
      `${this.url}/storage/v1/object/${this.physical(bucket)}/${encodeURIComponent(path)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.serviceKey}`,
          apikey: this.serviceKey,
        },
      }
    );
  }
}

let cached: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key ? new SupabaseStorageProvider(url, key) : new MockStorageProvider();
  return cached;
}

export function setStorageProvider(provider: StorageProvider | null): void {
  cached = provider;
}

/* ── upload limits, enforced server-side ────────────────────────────────── */

export const UPLOAD_LIMITS: Record<
  StorageBucket,
  { maxBytes: number; contentTypes: string[]; label: string }
> = {
  headshots: {
    maxBytes: 15 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
    label: "headshot",
  },
  resumes: {
    maxBytes: 10 * 1024 * 1024,
    contentTypes: ["application/pdf"],
    label: "resume PDF",
  },
  "audition-audio": {
    maxBytes: 25 * 1024 * 1024,
    contentTypes: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-m4a", "audio/webm", "audio/ogg"],
    label: "audition recording",
  },
  "family-documents": {
    maxBytes: 20 * 1024 * 1024,
    contentTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    label: "document",
  },
  "staff-photos": {
    maxBytes: 15 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
    label: "staff photo",
  },
  "button-photos": {
    maxBytes: 12 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
    label: "button photo",
  },
  "reference-photos": {
    maxBytes: 12 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
    label: "reference photo",
  },
  // The one PUBLIC bucket: curriculum is teaching material published to
  // families on purpose. Everything else stays private.
  curriculum: {
    maxBytes: 25 * 1024 * 1024,
    contentTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    label: "curriculum document",
  },
};

export class UploadRejectedError extends Error {}

/**
 * Validates a data URL against the bucket's limits. Called on the SERVER —
 * the client checks too, for a fast message, but this is the one that counts.
 */
export function assertUploadAllowed(bucket: StorageBucket, dataUrl: string): void {
  const limits = UPLOAD_LIMITS[bucket];
  let parsed;
  try {
    parsed = parseDataUrl(dataUrl);
  } catch {
    throw new UploadRejectedError(`That doesn't look like a valid ${limits.label}.`);
  }
  if (!limits.contentTypes.includes(parsed.contentType)) {
    throw new UploadRejectedError(
      `A ${limits.label} must be one of: ${limits.contentTypes.join(", ")}.`
    );
  }
  if (parsed.bytes.length > limits.maxBytes) {
    throw new UploadRejectedError(
      `That ${limits.label} is ${(parsed.bytes.length / 1024 / 1024).toFixed(1)} MB — the limit is ${limits.maxBytes / 1024 / 1024} MB.`
    );
  }
}
