import type { Metadata, Viewport } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import { org } from "@/config/org";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import "./globals.css";

/*
 * The staff portal's two faces, so the parent portal reads as the same
 * product (Tony, 2026-08-16: "drop the serif, make it match the staff
 * portal"). DM Sans for everything; Outfit only where the staff portal uses
 * its display face — the wordmark and the mission plaque.
 *
 * This used to be Cinzel, a serif, on every h1/h2/h3. That single rule was
 * most of what made the two products look like different companies.
 */
const display = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: org.appName,
    template: `%s · ${org.appName}`,
  },
  description: `The family hub for ${org.name} — schedules, profiles, forms, photos, and news for ${org.programBrand} families.`,
  applicationName: org.appName,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: org.appName,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#08111f" },
    { media: "(prefers-color-scheme: dark)", color: "#08111f" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply saved theme before first paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch{}`,
          }}
        />
      </head>
      <body className={`${display.variable} ${body.variable} antialiased min-h-dvh`}>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
