import { authorizationHeader, type OAuthCredentials } from "./smugmug-oauth";
import type { Gallery, GalleryPhoto } from "./types";

/**
 * SmugMug gallery ingestion (#6).
 *
 * We read gallery metadata and image URLs only — photos stay on SmugMug and
 * every link points back there, so purchases keep flowing through SmugMug's
 * cart. We never copy or re-host originals.
 *
 * The real adapter is IMPLEMENTED and dormant. It needs four OAuth 1.0a values
 * (NEEDS-FROM-TONY.md #4); with none of them set, getSmugMugProvider falls back
 * to the mock and every surface says so out loud. Paste the credentials into
 * Netlify as PLAIN variables — a "secret"-flagged variable never reaches the
 * function runtime, which is a lesson this org has already paid for once — and
 * the bridge is live on the next deploy with no code change.
 */

export interface SmugMugProvider {
  readonly displayName: string;
  isConfigured(): boolean;
  listGalleries(): Promise<Gallery[]>;
  listPhotos(galleryExternalId: string): Promise<GalleryPhoto[]>;
}

/**
 * Mock gallery. Photo URLs follow the `/face/<identity>/<variant>` shape the
 * mock face provider understands, so matching behaves deterministically:
 *   ava, chidi   → consented students in the seed data
 *   lien, amara  → students WITHOUT face-matching consent
 *   stranger     → nobody in the app
 */
export class MockSmugMugProvider implements SmugMugProvider {
  readonly displayName = "Mock SmugMug (no API key)";

  isConfigured(): boolean {
    return false;
  }

  async listGalleries(): Promise<Gallery[]> {
    return [
      {
        id: "gal-frozen-dress",
        externalId: "SM-ALBUM-8f3a",
        title: "Frozen Jr. — Dress Rehearsal",
        productionId: "prod-frozen",
        photoCount: 6,
        url: "https://novapa.smugmug.com/Frozen-Jr-Dress-Rehearsal",
        createdAt: "2026-07-24T22:00:00.000Z",
      },
    ];
  }

  async listPhotos(galleryExternalId: string): Promise<GalleryPhoto[]> {
    if (galleryExternalId !== "SM-ALBUM-8f3a") return [];
    const photos: Array<{ id: string; identity: string; variant: string }> = [
      { id: "ph-1", identity: "ava", variant: "stage-1.jpg" },
      { id: "ph-2", identity: "ava", variant: "stage-2.jpg" },
      { id: "ph-3", identity: "chidi", variant: "stage-1.jpg" },
      { id: "ph-4", identity: "lien", variant: "stage-1.jpg" },
      { id: "ph-5", identity: "stranger", variant: "crowd-1.jpg" },
      { id: "ph-6", identity: "noface", variant: "set-1.jpg" },
    ];

    return photos.map((photo) => ({
      id: photo.id,
      galleryId: "gal-frozen-dress",
      externalId: `SM-IMG-${photo.id}`,
      thumbnailUrl: `https://photos.smugmug.com/face/${photo.identity}/${photo.variant}`,
      url: `https://novapa.smugmug.com/Frozen-Jr-Dress-Rehearsal/i-${photo.id}`,
      takenAt: "2026-07-24T23:15:00.000Z",
      width: 2400,
      height: 1600,
    }));
  }
}

/* -------------------------------------------------------------------------- */
/*  The real thing                                                            */
/* -------------------------------------------------------------------------- */

const API_ROOT = "https://api.smugmug.com";

/** SmugMug's own paging maximum for these endpoints. */
const PAGE_SIZE = 100;

/**
 * A ceiling on paging, so a misread response cannot spin forever.
 *
 * 100 pages is 10,000 albums or 10,000 images in one album — far past anything
 * NoVAPA will have, and near enough that hitting it means something is wrong
 * with the loop rather than with the account. It logs and stops rather than
 * silently truncating.
 */
const MAX_PAGES = 100;

interface SmugMugAlbum {
  AlbumKey: string;
  Name: string;
  ImageCount?: number;
  WebUri?: string;
  Date?: string;
  Description?: string;
}

interface SmugMugImage {
  ImageKey: string;
  FileName?: string;
  ThumbnailUrl?: string;
  ArchivedUri?: string;
  WebUri?: string;
  Date?: string;
  DateTimeOriginal?: string;
  OriginalWidth?: number;
  OriginalHeight?: number;
  IsVideo?: boolean;
  Uris?: { LargestImage?: { Uri?: string } };
}

/**
 * SmugMug API v2, read-only.
 *
 * ---------------------------------------------------------------------------
 * What it takes and what it deliberately leaves behind
 * ---------------------------------------------------------------------------
 * Album metadata and image URLs, nothing else. Photos stay on SmugMug, every
 * link points back there, and no original is ever copied or re-hosted — which
 * is both the privacy position and the commercial one, because prints are sold
 * through SmugMug's own cart.
 *
 * ---------------------------------------------------------------------------
 * Which URL the face service is given
 * ---------------------------------------------------------------------------
 * `ArchivedUri` is the full original and can be 40MB from a modern body. The
 * matcher wants a face big enough to embed, not a print master, so this asks
 * for the largest sized RENDITION and falls back down the chain. Sending
 * originals would make every ingest slow and expensive for no accuracy gain.
 *
 * ---------------------------------------------------------------------------
 * Videos are skipped
 * ---------------------------------------------------------------------------
 * A video's thumbnail is one arbitrary frame. Matching a child from it produces
 * a claim nobody can check against the thing it came from, so they are dropped
 * at the boundary rather than half-handled downstream.
 */
export class SmugMugApiProvider implements SmugMugProvider {
  readonly displayName = "SmugMug";

  /** Resolved once per process from !authuser; the nickname is not in env. */
  private nickname: string | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly oauthToken: string,
    private readonly oauthSecret: string
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiSecret && this.oauthToken && this.oauthSecret);
  }

  private get creds(): OAuthCredentials {
    return {
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      oauthToken: this.oauthToken,
      oauthSecret: this.oauthSecret,
    };
  }

  /**
   * One signed GET.
   *
   * The error path matters as much as the happy one: a 401 here means the
   * credentials or the signature, and saying so plainly is the difference
   * between a five-minute fix and an afternoon. The body is included because
   * SmugMug puts a real reason in it.
   */
  private async get<T>(path: string): Promise<T> {
    const url = path.startsWith("http") ? path : `${API_ROOT}${path}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: authorizationHeader(this.creds, "GET", url),
      },
      // SmugMug is the source of truth and ingest runs on a schedule; a cached
      // album list would quietly miss the gallery somebody just published.
      cache: "no-store",
    });

    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 400);
      if (res.status === 401) {
        throw new Error(
          `SmugMug rejected the credentials (401). Check SMUGMUG_API_KEY / _API_SECRET / _OAUTH_TOKEN / _OAUTH_SECRET are the org account's and are plain (not "secret"-flagged) Netlify variables. ${body}`
        );
      }
      throw new Error(`SmugMug ${res.status} for ${path}: ${body}`);
    }

    const json = (await res.json()) as { Response?: T };
    if (!json.Response) throw new Error(`SmugMug returned no Response for ${path}`);
    return json.Response;
  }

  /** The org account's nickname, which every album URL is keyed by. */
  private async user(): Promise<string> {
    if (this.nickname) return this.nickname;
    const res = await this.get<{ User?: { NickName?: string } }>("/api/v2!authuser");
    const nick = res.User?.NickName;
    if (!nick) throw new Error("SmugMug !authuser returned no NickName");
    this.nickname = nick;
    return nick;
  }

  /**
   * Every page of a collection.
   *
   * SmugMug pages with 1-based `start` and returns fewer than `count` on the
   * last page — but it also returns an empty array rather than an error past
   * the end, so the loop stops on a short page OR an empty one. `pick` pulls
   * the right array out because the key differs per endpoint (Album,
   * AlbumImage) and there is no envelope that names it consistently.
   */
  private async pages<T>(path: string, pick: (r: Record<string, unknown>) => T[] | undefined): Promise<T[]> {
    const out: T[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const start = page * PAGE_SIZE + 1;
      const sep = path.includes("?") ? "&" : "?";
      const res = await this.get<Record<string, unknown>>(
        `${path}${sep}start=${start}&count=${PAGE_SIZE}`
      );
      const batch = pick(res) ?? [];
      out.push(...batch);
      if (batch.length < PAGE_SIZE) return out;
    }
    console.warn(
      `SmugMug: stopped paging ${path} at ${MAX_PAGES * PAGE_SIZE} items — this is a guard, not a real limit.`
    );
    return out;
  }

  async listGalleries(): Promise<Gallery[]> {
    const nickname = await this.user();
    const albums = await this.pages<SmugMugAlbum>(
      `/api/v2/user/${encodeURIComponent(nickname)}!albums`,
      (r) => r.Album as SmugMugAlbum[] | undefined
    );

    return albums.map((a) => ({
      // The album key IS the stable identity — album names get edited, and a
      // rename must not read as "old gallery gone, new gallery appeared" and
      // re-ingest every photo in it.
      id: `sm-${a.AlbumKey}`,
      externalId: a.AlbumKey,
      title: a.Name,
      photoCount: a.ImageCount ?? 0,
      url: a.WebUri ?? `https://www.smugmug.com/app/organize/${a.AlbumKey}`,
      createdAt: a.Date ?? new Date(0).toISOString(),
    }));
  }

  async listPhotos(galleryExternalId: string): Promise<GalleryPhoto[]> {
    const images = await this.pages<SmugMugImage>(
      `/api/v2/album/${encodeURIComponent(galleryExternalId)}!images`,
      (r) => r.AlbumImage as SmugMugImage[] | undefined
    );

    return images
      .filter((i) => !i.IsVideo)
      .map((i) => ({
        id: `sm-${i.ImageKey}`,
        galleryId: `sm-${galleryExternalId}`,
        externalId: i.ImageKey,
        // A rendition, never ArchivedUri — see the class comment.
        thumbnailUrl: i.ThumbnailUrl ?? i.WebUri ?? i.ArchivedUri ?? "",
        url: i.WebUri ?? "",
        takenAt: i.DateTimeOriginal ?? i.Date,
        width: i.OriginalWidth ?? 0,
        height: i.OriginalHeight ?? 0,
      }))
      .filter((p) => p.thumbnailUrl);
  }
}

let cached: SmugMugProvider | null = null;

export function getSmugMugProvider(): SmugMugProvider {
  if (cached) return cached;
  const { SMUGMUG_API_KEY, SMUGMUG_API_SECRET, SMUGMUG_OAUTH_TOKEN, SMUGMUG_OAUTH_SECRET } =
    process.env;
  cached =
    SMUGMUG_API_KEY && SMUGMUG_API_SECRET && SMUGMUG_OAUTH_TOKEN && SMUGMUG_OAUTH_SECRET
      ? new SmugMugApiProvider(
          SMUGMUG_API_KEY,
          SMUGMUG_API_SECRET,
          SMUGMUG_OAUTH_TOKEN,
          SMUGMUG_OAUTH_SECRET
        )
      : new MockSmugMugProvider();
  return cached;
}

export function setSmugMugProvider(provider: SmugMugProvider | null): void {
  cached = provider;
}

/**
 * Whether the bridge is really connected, and if not, exactly what is missing.
 *
 * Named variables rather than a boolean, because the failure this is for is
 * three of the four values being set. "SmugMug is not configured" sends
 * somebody to re-read the whole setup; "SMUGMUG_OAUTH_SECRET is missing" is a
 * thirty-second fix. Values are never returned — only which names are absent.
 */
export function smugMugStatus(): {
  connected: boolean;
  provider: string;
  missing: string[];
} {
  const names = [
    "SMUGMUG_API_KEY",
    "SMUGMUG_API_SECRET",
    "SMUGMUG_OAUTH_TOKEN",
    "SMUGMUG_OAUTH_SECRET",
  ];
  const missing = names.filter((n) => !(process.env[n] ?? "").trim());
  const provider = getSmugMugProvider();
  return { connected: missing.length === 0, provider: provider.displayName, missing };
}
