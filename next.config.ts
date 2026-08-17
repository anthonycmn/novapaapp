import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Build output directory, overridable per process.
   *
   * Two Next processes started from one checkout share .next and quietly
   * destroy each other's chunks. The symptom is a build that fails
   * prerendering with "a[d] is not a function", or a dev page stuck on
   * Loading forever — neither of which points at the cause. Set NEXT_DIST_DIR
   * to give a second process its own directory. Unset, this is stock.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // SmugMug photo CDN (Phase 6 gallery ingestion)
      { protocol: "https", hostname: "photos.smugmug.com" },
      { protocol: "https", hostname: "**.smugmug.com" },
    ],
  },
  headers: async () => [
    {
      // Service worker must be served with a permissive scope from the root.
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
  ],
};

export default nextConfig;
