import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
