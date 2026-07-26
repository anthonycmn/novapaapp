import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito_Sans } from "next/font/google";
import { org } from "@/config/org";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

const body = Nunito_Sans({
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
    { media: "(prefers-color-scheme: light)", color: "#8e1f2f" },
    { media: "(prefers-color-scheme: dark)", color: "#171214" },
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
