import { restoreMockStore, serializeMockStore } from "./provider";

/**
 * Cross-instance persistence for the mock store.
 *
 * Netlify runs the app as serverless functions: each instance has its own
 * module memory, and instances come and go per request. Without this layer
 * a rubric saved on one instance simply doesn't exist on the next — which
 * is exactly the bug Tony hit on the live site.
 *
 * Strategy: snapshot the entire store to a Netlify Blob after every write,
 * and reload it (with a 1-second per-instance TTL so one page render's
 * many reads share a single fetch) before every data call. Strong
 * consistency is required — the default eventual mode could hand back a
 * pre-write snapshot and reintroduce the bug we're fixing.
 *
 * Off Netlify (local dev, CI, tests) the blob client can't configure
 * itself; we detect that once and quietly run pure in-memory, which is the
 * original behavior. Last-write-wins across concurrent instances is an
 * accepted trade-off for a demo backend — the real fix is Supabase.
 */

type BlobStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
};

let blobStore: BlobStore | null | undefined;

async function blob(): Promise<BlobStore | null> {
  if (blobStore !== undefined) return blobStore;
  try {
    const { getStore } = await import("@netlify/blobs");
    const candidate = getStore({ name: "mock-data", consistency: "strong" });
    // Probe once: off-Netlify this throws on first use, not at construction.
    await candidate.get("__probe__");
    blobStore = candidate as unknown as BlobStore;
  } catch {
    blobStore = null;
  }
  return blobStore;
}

const LOAD_TTL_MS = 1000;
let lastLoadAt = 0;

/** Pull the latest snapshot into module memory, at most once per second. */
export async function ensureMockStoreLoaded(): Promise<void> {
  const now = Date.now();
  if (now - lastLoadAt < LOAD_TTL_MS) return;
  lastLoadAt = now;

  const store = await blob();
  if (!store) return;
  try {
    const snapshot = await store.get("store");
    if (snapshot) restoreMockStore(snapshot);
  } catch (error) {
    console.error("mock persistence: load failed", error);
  }
}

/** Write the current store out so other instances see it. */
export async function persistMockStore(): Promise<void> {
  const store = await blob();
  if (!store) return;
  try {
    await store.set("store", serializeMockStore());
  } catch (error) {
    console.error("mock persistence: save failed", error);
  }
}

/** For the health-check route: is cross-instance persistence active? */
export async function isPersistenceActive(): Promise<boolean> {
  return (await blob()) !== null;
}
