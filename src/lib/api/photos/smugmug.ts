import type { Gallery, GalleryPhoto } from "./types";

/**
 * SmugMug gallery ingestion (#6).
 *
 * We read gallery metadata and image URLs only — photos stay on SmugMug and
 * every link points back there, so purchases keep flowing through SmugMug's
 * cart. We never copy or re-host originals.
 *
 * The real adapter needs OAuth 1.0a credentials (NEEDS-FROM-TONY.md #4);
 * until those exist the mock serves a seeded gallery so the whole matching
 * pipeline is demo-able.
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

/**
 * Real adapter. SmugMug's API v2 is OAuth 1.0a signed; the request signing
 * is intentionally left unimplemented rather than guessed, because getting
 * it subtly wrong fails in confusing ways. Wire it when credentials arrive
 * (NEEDS-FROM-TONY.md #4).
 */
export class SmugMugApiProvider implements SmugMugProvider {
  readonly displayName = "SmugMug";

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly oauthToken: string,
    private readonly oauthSecret: string
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiSecret && this.oauthToken && this.oauthSecret);
  }

  async listGalleries(): Promise<Gallery[]> {
    throw new Error(
      "SmugMug API adapter not implemented yet — OAuth 1.0a signing needs the real credentials. See NEEDS-FROM-TONY.md #4."
    );
  }

  async listPhotos(): Promise<GalleryPhoto[]> {
    throw new Error(
      "SmugMug API adapter not implemented yet — see NEEDS-FROM-TONY.md #4."
    );
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
