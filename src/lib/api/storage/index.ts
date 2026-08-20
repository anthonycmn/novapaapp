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
  | "audition-video"
  | "family-documents"
  | "staff-photos"
  | "button-photos"
  | "reference-photos";

export interface StoredFile {
  url: string;
  path: string;
  bucket: StorageBucket;
  sizeBytes: number;
  contentType: string;
}

/** A one-shot permission for the browser to write one file, itself. */
export interface SignedUpload {
  /** PUT the raw file here. No auth header needed — the token is in the URL. */
  uploadUrl: string;
  /** Where the file will live once written. */
  path: string;
  /** The address to store on the record afterwards. */
  publicUrl: string;
}

export interface StorageProvider {
  readonly displayName: string;
  isConfigured(): boolean;
  /** `dataUrl` is a `data:<type>;base64,...` string from the client. */
  upload(bucket: StorageBucket, path: string, dataUrl: string): Promise<StoredFile>;
  /**
   * Mint a short-lived URL the browser can PUT a file to directly.
   *
   * This exists because of a hard ceiling, not a preference: this app is
   * served by serverless functions with a 6 MB request-body limit, and base64
   * inflates a file by a third on the way through. Anything larger than about
   * four megabytes — which is most PDFs and every video — simply cannot reach
   * the server. Handing the browser a signed URL takes the function out of the
   * path entirely: only the address travels back.
   */
  createSignedUpload(bucket: StorageBucket, path: string): Promise<SignedUpload>;
  /**
   * Where a file at this path lives, worked out rather than looked up.
   *
   * This is what lets a direct upload be claimed safely. The browser sends back
   * only the storage PATH it was given; the server rebuilds the address itself.
   * Take the URL from the client instead and a family can record any address
   * they like against their own paperwork — including one that is not ours.
   */
  publicUrlFor(bucket: StorageBucket, path: string): string;
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

  async createSignedUpload(): Promise<SignedUpload> {
    // Nothing to sign without a bucket. The route reports this honestly rather
    // than handing back a URL that would silently fail.
    throw new Error("Storage is not configured, so there is nowhere to upload to.");
  }

  publicUrlFor(bucket: StorageBucket, path: string): string {
    return this.files.get(`${bucket}/${path}`)?.url ?? `mock://${bucket}/${path}`;
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

  async createSignedUpload(bucket: StorageBucket, path: string): Promise<SignedUpload> {
    const physical = this.physical(bucket);
    const response = await fetch(
      `${this.url}/storage/v1/object/upload/sign/${physical}/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.serviceKey}`,
          apikey: this.serviceKey,
          "Content-Type": "application/json",
        },
        // Replacing a video is the common case — a family re-records — so the
        // signed URL has to permit an overwrite or the second attempt fails
        // with a conflict the parent cannot interpret.
        body: JSON.stringify({ upsert: true }),
      }
    );
    if (!response.ok) {
      throw new Error(
        `Could not prepare the upload (${response.status}): ${await response.text()}`
      );
    }
    const data = (await response.json()) as { url?: string };
    if (!data.url) throw new Error("Storage did not return an upload URL.");
    return {
      // Supabase returns a path-with-token relative to /storage/v1.
      uploadUrl: `${this.url}/storage/v1${data.url.startsWith("/") ? "" : "/"}${data.url}`,
      path,
      publicUrl: `${this.url}/storage/v1/object/${physical}/${path}`,
    };
  }

  publicUrlFor(bucket: StorageBucket, path: string): string {
    return `${this.url}/storage/v1/object/${this.physical(bucket)}/${path}`;
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
  /*
   * Self-tapes and dance videos.
   *
   * 500 MB because a two-minute clip off a modern phone is routinely 150–300
   * MB and a family filming in a kitchen has no way to compress it. This is
   * only viable because the file goes STRAIGHT to storage from the browser —
   * see uploadDirect(). Nothing this size can pass through a serverless
   * function on this host, which caps a request body at 6 MB.
   */
  "audition-video": {
    maxBytes: 500 * 1024 * 1024,
    contentTypes: [
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-m4v",
      "video/mpeg",
    ],
    label: "audition video",
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
};

export class UploadRejectedError extends Error {}

/**
 * How a file reached us.
 *
 * Small files still ride through a server action as a base64 data URL, because
 * for a headshot that is simpler and there is nothing to gain. Anything that
 * cannot fit the 6 MB request-body cap — a scanned PDF, a recording — goes
 * straight from the browser to storage first, and what arrives here afterwards
 * is only the path it was written to.
 */
export type UploadSource =
  | { kind: "dataUrl"; dataUrl: string }
  | {
      kind: "stored";
      /** The path handed out by /api/uploads/sign, and nothing else. */
      storagePath: string;
      contentType: string;
      sizeBytes: number;
    };

/** What a record needs in order to point at a file, however it got there. */
export interface ResolvedUpload {
  url: string;
  path: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * A path a client handed back has to sit inside the folder we scoped it to.
 *
 * The signing route composes every path itself and never accepts one, so a
 * legitimate claim always begins with the caller's own family or student id.
 * This is the check that keeps it that way on the return leg — without it a
 * family could file another household's document into their own vault by
 * quoting its path.
 */
export function assertClaimedPath(path: string, scopePrefix: string): void {
  const bad =
    !path ||
    path.length > 400 ||
    path.startsWith("/") ||
    path.includes("..") ||
    path.includes("\\") ||
    [...path].some((character) => character.charCodeAt(0) < 0x20) ||
    !path.startsWith(`${scopePrefix}/`);
  if (bad) throw new UploadRejectedError("That upload does not belong to this record.");
}

/**
 * Turn either kind of upload into the row we are about to write.
 *
 * A data URL is validated and pushed to storage here. A direct upload is
 * already in the bucket, so what is checked instead is that the path is one we
 * could have issued to this caller, and that the type and size it reports are
 * ones the bucket would have accepted in the first place. Those two numbers
 * come from the browser and are display metadata — the bytes themselves are
 * whatever was written to a path we scoped — so they are bounded here rather
 * than trusted.
 */
export async function resolveUpload(
  bucket: StorageBucket,
  source: UploadSource,
  scopePrefix: string
): Promise<ResolvedUpload> {
  const limits = UPLOAD_LIMITS[bucket];

  if (source.kind === "dataUrl") {
    assertUploadAllowed(bucket, source.dataUrl);
    const path = `${scopePrefix}/${crypto.randomUUID()}`;
    const stored = await getStorageProvider().upload(bucket, path, source.dataUrl);
    return {
      url: stored.url,
      path: stored.path,
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
    };
  }

  assertClaimedPath(source.storagePath, scopePrefix);
  if (!limits.contentTypes.includes(source.contentType)) {
    throw new UploadRejectedError(
      `A ${limits.label} must be one of: ${limits.contentTypes.join(", ")}.`
    );
  }
  const sizeBytes = Number(source.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > limits.maxBytes) {
    throw new UploadRejectedError(
      `That ${limits.label} is outside the ${limits.maxBytes / 1024 / 1024} MB limit.`
    );
  }

  return {
    url: getStorageProvider().publicUrlFor(bucket, source.storagePath),
    path: source.storagePath,
    contentType: source.contentType,
    sizeBytes,
  };
}

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
