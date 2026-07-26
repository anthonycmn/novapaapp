import type { MetadataRoute } from "next";
import { org } from "@/config/org";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: org.appName,
    short_name: org.shortName,
    description: `Schedules, profiles, forms, photos, and news for ${org.programBrand} families.`,
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#8e1f2f",
    orientation: "portrait",
    categories: ["education", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
