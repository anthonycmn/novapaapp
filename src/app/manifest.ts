import type { MetadataRoute } from "next";
import { org } from "@/config/org";

export default function manifest(): MetadataRoute.Manifest {
  return {
    /* A stable identity, independent of start_url — the Play Store package
       (Tier 2) and the browser's install bookkeeping both key off it. */
    id: "/",
    name: org.appName,
    short_name: org.shortName,
    description: `Schedules, profiles, forms, photos, and news for ${org.programBrand} families.`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fdfaf3",
    theme_color: "#08111f",
    orientation: "portrait",
    categories: ["education", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
