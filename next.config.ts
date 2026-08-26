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
  /*
   * Server actions carry the face-matching photos, and Next's default body
   * limit is 1 MB.
   *
   * That default is the whole of bug #7 in the 25 Aug parent feedback — "this
   * feature allows only two photos to be uploaded, rather than the 2-4
   * indicated." Nothing in the app caps it at two: MIN/MAX_REFERENCE_PHOTOS
   * are 2 and 4, the zod schema accepts four, and the picker allows four. Four
   * downscaled photos simply do not fit in 1 MB, so the third or fourth one
   * made the request fail — and somebody had already met that error once and
   * responded by shrinking each photo's budget to 700 KB, believing the cap
   * was the 6 MB FUNCTION_BODY_CAP_BYTES in image-picker.ts. It never was.
   *
   * 4 MB: four photos at their 700 KB budget is 2.8 MB, which leaves room for
   * the rest of the request and stays well under Netlify's own 6 MB function
   * payload cap.
   */
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
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
