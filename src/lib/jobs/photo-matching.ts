import { getProvider } from "@/lib/api";
import { getSmugMugProvider } from "@/lib/api/photos/smugmug";

/**
 * Ingest + match background job (#6).
 *
 * Hard requirement from the brief: "Match processing runs in a background
 * job, never blocking a page load." Nothing in a page render may await this.
 * It is driven by:
 *   • POST /api/photos/ingest  (cron or an admin button)
 *   • the admin Photos page, which fires and forgets
 *
 * Embedding a gallery is slow and CPU-bound; a page render that waited on it
 * would hang for a parent standing in a lobby.
 */

export interface IngestResult {
  galleriesSeen: number;
  photosIngested: number;
  photosScanned: number;
  matchesCreated: number;
  errors: string[];
}

let running = false;

/** True while a job is in flight, so the UI can show progress honestly. */
export function isMatchingRunning(): boolean {
  return running;
}

export async function runIngestAndMatch(actorId: string): Promise<IngestResult> {
  const result: IngestResult = {
    galleriesSeen: 0,
    photosIngested: 0,
    photosScanned: 0,
    matchesCreated: 0,
    errors: [],
  };

  if (running) {
    result.errors.push("A matching run is already in progress.");
    return result;
  }
  running = true;

  try {
    const provider = getProvider();
    const smugmug = getSmugMugProvider();

    const galleries = await smugmug.listGalleries();
    result.galleriesSeen = galleries.length;

    for (const gallery of galleries) {
      try {
        const photos = await smugmug.listPhotos(gallery.externalId);
        const { photosIngested } = await provider.ingestGallery(actorId, gallery, photos);
        result.photosIngested += photosIngested;
      } catch (error) {
        result.errors.push(`Gallery "${gallery.title}": ${String(error)}`);
      }
    }

    const matched = await provider.runMatching(actorId);
    result.photosScanned = matched.photosScanned;
    result.matchesCreated = matched.matchesCreated;
  } catch (error) {
    result.errors.push(String(error));
  } finally {
    running = false;
  }

  return result;
}
